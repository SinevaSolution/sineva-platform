import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JwtAuthService } from '@/server/infrastructure/auth/jwt_auth_service';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { FakeBreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import { PasswordHasher } from '@/server/infrastructure/security/password_hasher';
import { JwtService } from '@/server/infrastructure/security/jwt_service';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';

describe('JwtAuthService (Custom JWT Auth Engine)', () => {
  const secret = 'super-secret-auth-key-32-chars-long-test!';
  const appUrl = 'https://app.sineva.ai';

  let emailSender: FakeEmailSender;
  let auditLogger: CountingAuditLogger;
  let breachedChecker: FakeBreachedPasswordChecker;

  beforeEach(() => {
    emailSender = new FakeEmailSender();
    auditLogger = new CountingAuditLogger();
    breachedChecker = new FakeBreachedPasswordChecker(['breachedpassword123']);
  });

  it('signs up a new user, hashes password, saves verification token and sends verify_email email', async () => {
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'usr-new-1' })),
      },
      account: {
        create: vi.fn().mockResolvedValue({ id: 'acc-1' }),
      },
      verification: {
        create: vi.fn().mockResolvedValue({ id: 'ver-1' }),
      },
      $transaction: vi.fn().mockImplementation((callback) => callback(mockPrisma)),
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    const res = await authService.signUp({
      email: 'budi@example.com',
      password: 'mypassword12345',
      full_name: 'Budi Santoso',
      terms_accepted_version: 'v1.0',
      privacy_accepted_version: 'v1.0',
    });

    expect(res.user.id).toBe('usr-new-1');
    expect(res.user.email).toBe('budi@example.com');

    // Account creation called with scrypt password hash
    expect(mockPrisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider_id: 'credential',
          password: expect.stringMatching(/^scrypt:/),
        }),
      }),
    );

    // Email sent
    expect(emailSender.getSentEmails()).toHaveLength(1);
    const email = emailSender.getLastEmail();
    expect(email?.template).toBe('verify_email');
    expect(email?.to).toBe('budi@example.com');
    expect(email?.rendered.text).toContain('/verify-email?token=');

    // Audit log
    const events = auditLogger.getEvents();
    expect(events.some((e) => e.action === 'user.signed_up')).toBe(true);
  });

  it('signs in with valid password, returns valid JWT and sets fresh session', async () => {
    const storedHash = PasswordHasher.hash('correctPassword123');
    const mockUser = {
      id: 'usr-123',
      email: 'alice@example.com',
      full_name: 'Alice Wonder',
      email_verified: true,
      accounts: [
        {
          provider_id: 'credential',
          password: storedHash,
        },
      ],
    };

    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      authLoginAttempt: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      session: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'sess-abc' })),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    const res = await authService.signIn({
      email: 'alice@example.com',
      password: 'correctPassword123',
      ip_address: '127.0.0.1',
    });

    expect(res.user.id).toBe('usr-123');
    expect(res.session.token).toBeTruthy();

    // Verify JWT
    const claims = JwtService.verify(res.session.token, secret);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('usr-123');
    expect(claims?.email).toBe('alice@example.com');
    expect(claims?.email_verified).toBe(true);

    // Session saved with token_hash (never plain token alone)
    expect(mockPrisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: res.session.token,
          token_hash: expect.any(String),
          fresh_until: expect.any(Date),
        }),
      }),
    );

    // Audit log
    expect(auditLogger.getEvents().some((e) => e.action === 'user.signed_in')).toBe(true);
  });

  it('rejects incorrect password and triggers lockout on 5th consecutive failure', async () => {
    const storedHash = PasswordHasher.hash('correctPassword123');
    const mockUser = {
      id: 'usr-123',
      email: 'alice@example.com',
      accounts: [{ provider_id: 'credential', password: storedHash }],
    };

    let failures = 4; // Already 4 failures, next one is 5th
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockUser),
      },
      authLoginAttempt: {
        findMany: vi.fn().mockImplementation(() =>
          Promise.resolve(Array(failures).fill({ success: false, attempted_at: new Date() })),
        ),
        count: vi.fn().mockResolvedValue(failures),
        create: vi.fn().mockImplementation(() => {
          failures++;
          return Promise.resolve({ id: 'att-1' });
        }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    // 5th attempt with wrong password -> triggers lockout
    await expect(
      authService.signIn({
        email: 'alice@example.com',
        password: 'wrongPassword',
        ip_address: '127.0.0.1',
      }),
    ).rejects.toThrow(ForbiddenError);

    // Lockout email sent
    expect(emailSender.getSentEmails()).toHaveLength(1);
    expect(emailSender.getLastEmail()?.template).toBe('lockout_notice');

    // Audit event
    expect(auditLogger.getEvents().some((e) => e.action === 'user.locked_out')).toBe(true);
  });

  it('resolves session from valid JWT token', async () => {
    const token = JwtService.sign(
      {
        sub: 'usr-789',
        jti: 'sess-789',
        email: 'bob@example.com',
        name: 'Bob',
        email_verified: true,
        fresh_until: Math.floor(Date.now() / 1000) + 900,
      },
      secret,
    );

    const mockPrisma = {
      session: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sess-789',
          user_id: 'usr-789',
          fresh_until: new Date(Date.now() + 900000),
          user: {
            id: 'usr-789',
            email_verified: true,
            staff_profile: null,
            memberships: [
              {
                workspace_id: 'ws-test',
                role: 'member',
                specialist_scope: 'all',
              },
            ],
          },
        }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    const session = await authService.resolveSessionFromToken(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe('usr-789');
    expect(session?.sessionId).toBe('sess-789');
    expect(session?.emailVerified).toBe(true);
    expect(session?.memberships).toHaveLength(1);
    expect(session?.memberships[0]?.workspaceId).toBe('ws-test');
  });

  it('requests password reset non-enumeratingly and sends reset link', async () => {
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.email === 'alice@example.com') {
            return Promise.resolve({ id: 'usr-1', email: 'alice@example.com', locale: 'id' });
          }
          return Promise.resolve(null);
        }),
      },
      verification: {
        create: vi.fn().mockResolvedValue({ id: 'ver-reset-1' }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    // 1. Registered email
    const res1 = await authService.requestPasswordReset({ email: 'alice@example.com' });
    expect(res1.message).toContain('If this email is registered');
    expect(emailSender.getSentEmails()).toHaveLength(1);
    expect(emailSender.getLastEmail()?.template).toBe('reset_password');
    expect(emailSender.getLastEmail()?.rendered.text).toContain('/reset-password?token=');

    // 2. Unregistered email: returns identical message, sends NO email (non-enumerating)
    emailSender.clear();
    const res2 = await authService.requestPasswordReset({ email: 'unknown@example.com' });
    expect(res2.message).toBe(res1.message);
    expect(emailSender.getSentEmails()).toHaveLength(0);
  });

  it('resets password, updates hash, deletes token, and revokes all active sessions', async () => {
    const mockPrisma = {
      verification: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'ver-123',
          identifier: 'alice@example.com',
          value: 'valid-reset-token',
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'usr-123',
          email: 'alice@example.com',
        }),
      },
      account: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      session: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    const res = await authService.resetPassword({
      token: 'valid-reset-token',
      new_password: 'newSuperSecretPassword123!',
    });

    expect(res.success).toBe(true);
    expect(res.user_id).toBe('usr-123');

    // Password updated with new scrypt hash
    expect(mockPrisma.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: expect.stringMatching(/^scrypt:/),
        }),
      }),
    );

    // Reset token deleted
    expect(mockPrisma.verification.deleteMany).toHaveBeenCalled();

    // All active sessions revoked
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'usr-123', revoked_at: null },
        data: expect.objectContaining({ revoked_at: expect.any(Date) }),
      }),
    );

    expect(auditLogger.getEvents().some((e) => e.action === 'user.password_reset_completed')).toBe(true);
  });

  it('verifies email with valid verification token and marks user verified', async () => {
    const mockPrisma = {
      verification: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'ver-456',
          identifier: 'alice@example.com',
          value: 'valid-verify-token',
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'usr-123',
          email: 'alice@example.com',
        }),
        update: vi.fn().mockResolvedValue({ id: 'usr-123' }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    const res = await authService.verifyEmail({ token: 'valid-verify-token' });
    expect(res.verified).toBe(true);
    expect(res.user_id).toBe('usr-123');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'usr-123' },
        data: expect.objectContaining({
          email_verified: true,
          email_verified_at: expect.any(Date),
        }),
      }),
    );
    expect(mockPrisma.verification.deleteMany).toHaveBeenCalled();
    expect(auditLogger.getEvents().some((e) => e.action === 'user.email_verified')).toBe(true);
  });

  it('re-authenticates user with fresh password, extending fresh_until window', async () => {
    const storedHash = PasswordHasher.hash('correctPassword123');
    const mockPrisma = {
      account: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-1',
          password: storedHash,
        }),
      },
      session: {
        update: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'usr-1',
          email: 'alice@example.com',
          full_name: 'Alice',
          email_verified: true,
        }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    const res = await authService.reauthenticate('usr-1', 'correctPassword123', 'sess-1');
    expect(res.refreshed_token).toBeTruthy();
    expect(res.fresh_until.getTime()).toBeGreaterThan(Date.now());

    // JWT payload has fresh_until in future
    const claims = JwtService.verify(res.refreshed_token, secret);
    expect(claims?.sub).toBe('usr-1');
    expect(claims?.fresh_until).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('signs out user by revoking session', async () => {
    const mockPrisma = {
      session: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const authService = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender,
      auditLogger,
      breachedChecker,
      authSecret: secret,
      appUrl,
    });

    await authService.signOut('sess-to-revoke');
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revoked_at: expect.any(Date) }),
      }),
    );
    expect(auditLogger.getEvents().some((e) => e.action === 'session.revoked')).toBe(true);
  });
});
