import 'server-only';
import crypto from 'node:crypto';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { EmailSender } from '@/server/domain/email/email_sender';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { BreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import { PasswordHasher } from '@/server/infrastructure/security/password_hasher';
import { JwtService } from '@/server/infrastructure/security/jwt_service';
import { validatePassword } from '@/server/domain/auth/password_policy';
import { calculateLockoutState } from '@/server/domain/auth/lockout_calculator';
import { PrismaLoginAttemptRepository } from './prisma_login_attempt_repository';
import type { LoginAttemptRepository } from '@/server/domain/auth/login_attempt_repository';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from '@/server/domain/errors/domain_error';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { isLinkNextPath } from '@/server/domain/auth/next_path';

export interface JwtAuthServiceConfig {
  prisma: PrismaClient;
  emailSender: EmailSender;
  auditLogger: AuditLogger;
  breachedChecker: BreachedPasswordChecker;
  authSecret: string;
  appUrl: string;
  loginAttemptRepo?: LoginAttemptRepository;
}

export interface SignUpParams {
  email: string;
  password: string;
  full_name: string;
  terms_accepted_version: string;
  privacy_accepted_version: string;
  marketing_opt_in?: boolean;
  locale?: string;
  timezone?: string;
  /** An invitation or ownership link to return to after verifying (see `isLinkNextPath`). */
  next?: string;
}

export interface SignInParams {
  email: string;
  password: string;
  ip_address: string;
  user_agent?: string;
}

export interface ResolvedAuthSession {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  freshUntil: Date | null;
  staffRole: 'operator' | 'platform_admin' | 'support' | null;
  memberships: Array<{
    workspaceId: string;
    role: UserRole;
    specialistScope: 'all' | 'selected';
    allowedSpecialists?: string[];
  }>;
}

export class JwtAuthService {
  private readonly prisma: PrismaClient;
  private readonly emailSender: EmailSender;
  private readonly auditLogger: AuditLogger;
  private readonly breachedChecker: BreachedPasswordChecker;
  private readonly authSecret: string;
  private readonly appUrl: string;
  private readonly loginAttemptRepo: LoginAttemptRepository;

  constructor(config: JwtAuthServiceConfig) {
    this.prisma = config.prisma;
    this.emailSender = config.emailSender;
    this.auditLogger = config.auditLogger;
    this.breachedChecker = config.breachedChecker;
    this.authSecret = config.authSecret;
    this.appUrl = config.appUrl;
    this.loginAttemptRepo =
      config.loginAttemptRepo ?? new PrismaLoginAttemptRepository(config.prisma);
  }

  async signUp(input: SignUpParams): Promise<{
    user: { id: string; email: string; name: string };
  }> {
    // 1. Password policy check
    const policy = validatePassword(input.password);
    if (!policy.valid) {
      throw new ValidationError(policy.reason ?? 'Invalid password', [
        { code: 'invalid_password', field: 'password', detail: policy.reason ?? '' },
      ]);
    }

    // 2. Breached password check
    const isBreached = await this.breachedChecker.isBreached(input.password);
    if (isBreached) {
      throw new ValidationError(
        'This password has appeared in a data breach. Please choose a different password for your security.',
        [
          {
            code: 'breached_password',
            field: 'password',
            detail: 'This password has appeared in a data breach.',
          },
        ],
      );
    }

    // 3. Terms & Privacy consent check
    if (!input.terms_accepted_version || !input.terms_accepted_version.trim()) {
      throw new ValidationError('You must accept the terms of service to create an account.', [
        {
          code: 'terms_required',
          field: 'terms_accepted_version',
          detail: 'Terms acceptance version is required',
        },
      ]);
    }

    if (!input.privacy_accepted_version || !input.privacy_accepted_version.trim()) {
      throw new ValidationError('You must accept the privacy policy to create an account.', [
        {
          code: 'privacy_required',
          field: 'privacy_accepted_version',
          detail: 'Privacy acceptance version is required',
        },
      ]);
    }

    const email = input.email.toLowerCase().trim();

    // 4. Duplicate check
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictError('User', email);
    }

    // 5. Hash password with scrypt
    const passwordHash = PasswordHasher.hash(input.password);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 6. DB creation (User, Account, Verification)
    const executeCreation = async (tx: PrismaClient) => {
      const user = await tx.user.create({
        data: {
          email,
          full_name: input.full_name.trim(),
          locale: input.locale ?? 'id',
          timezone: input.timezone ?? 'Asia/Jakarta',
          email_verified: false,
        },
      });

      await tx.account.create({
        data: {
          user_id: user.id,
          provider_id: 'credential',
          account_id: user.id,
          password: passwordHash,
        },
      });

      await tx.verification.create({
        data: {
          identifier: email,
          value: verificationToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      return user;
    };

    const user =
      typeof this.prisma.$transaction === 'function'
        ? await (
            this.prisma.$transaction as unknown as (
              fn: (tx: PrismaClient) => ReturnType<typeof executeCreation>,
            ) => ReturnType<typeof executeCreation>
          )(executeCreation)
        : await executeCreation(this.prisma);

    // 7. Send verification email. A valid `next` rides along so a person who
    // signed up from an invitation link lands back on it after verifying;
    // anything that is not such a link is dropped, never forwarded.
    const nextParam =
      input.next && isLinkNextPath(input.next) ? `&next=${encodeURIComponent(input.next)}` : '';
    await this.emailSender.send({
      to: email,
      template: 'verify_email',
      locale: input.locale === 'en' ? 'en' : 'id',
      params: {
        recipient_name: input.full_name,
        url: `${this.appUrl}/verify-email?token=${verificationToken}${nextParam}`,
        verification_url: `${this.appUrl}/verify-email?token=${verificationToken}${nextParam}`,
        expires_in_minutes: 24 * 60,
      },
    });

    // 8. Audit log
    await this.auditLogger.log({
      action: 'user.signed_up',
      context: {
        ...createAnonymousRequestContext('auth-signup'),
        user_id: user.id,
      },
      target_resource_id: user.id,
      target_resource_type: 'user',
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
      },
    };
  }

  async signIn(input: SignInParams): Promise<{
    user: { id: string; email: string; name: string; email_verified: boolean };
    session: { id: string; token: string; fresh_until: Date; expires_at: Date };
  }> {
    const email = input.email.toLowerCase().trim();
    const emailHash = crypto.createHash('sha256').update(email).digest('hex');

    // 1. Check existing lockout
    const failures = await this.loginAttemptRepo.getConsecutiveFailures(emailHash);
    const lockoutHistory = await this.loginAttemptRepo.getLockoutHistoryCount(emailHash);
    const lockoutState = calculateLockoutState(failures, lockoutHistory);

    if (lockoutState.isLocked) {
      throw new ForbiddenError(
        `Too many tries. You can try again in ${lockoutState.durationMinutes} minutes.`,
      );
    }

    // 2. Query user with accounts
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    });

    const credAccount = user?.accounts?.find((a: { provider_id: string; password?: string | null }) => a.provider_id === 'credential');
    const isValid = Boolean(
      user && credAccount?.password && PasswordHasher.verify(input.password, credAccount.password),
    );

    if (!isValid || !user) {
      // Record failed attempt
      await this.loginAttemptRepo.recordAttempt(emailHash, input.ip_address, false);

      await this.auditLogger.log({
        action: 'user.sign_in_failed',
        context: createAnonymousRequestContext('auth-signin-failed'),
        metadata: {
          emailHash,
          ip_address: input.ip_address,
        },
      });

      // Check if newly locked out
      const newFailures = await this.loginAttemptRepo.getConsecutiveFailures(emailHash);
      const newLockoutHistory = await this.loginAttemptRepo.getLockoutHistoryCount(emailHash);
      const newLockoutState = calculateLockoutState(newFailures, newLockoutHistory);

      if (newLockoutState.isLocked) {
        await this.emailSender.send({
          to: email,
          template: 'lockout_notice',
          locale: (user as { locale?: string } | null)?.locale === 'en' ? 'en' : 'id',
          params: {
            lockout_duration_minutes: newLockoutState.durationMinutes,
            attempt_time: new Date().toISOString(),
          },
        });

        await this.auditLogger.log({
          action: 'user.locked_out',
          context: createAnonymousRequestContext('auth-lockout'),
          metadata: {
            emailHash,
            durationMinutes: newLockoutState.durationMinutes,
          },
        });

        throw new ForbiddenError(
          `Too many tries. You can try again in ${newLockoutState.durationMinutes} minutes.`,
        );
      }

      throw new UnauthorizedError('Invalid email or password.');
    }

    // 3. Clear failed attempts on success
    await this.loginAttemptRepo.clearAttempts(emailHash);

    // 4. Create session & signed JWT
    const sessionId = crypto.randomUUID();
    const freshUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes fresh window
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const token = JwtService.sign(
      {
        sub: user.id,
        jti: sessionId,
        email: user.email,
        name: user.full_name,
        email_verified: user.email_verified,
        fresh_until: Math.floor(freshUntil.getTime() / 1000),
      },
      this.authSecret,
      { expiresInSeconds: 14 * 24 * 60 * 60 },
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        user_id: user.id,
        token,
        token_hash: tokenHash,
        fresh_until: freshUntil,
        expires_at: expiresAt,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
      },
    });

    // 5. Audit log
    await this.auditLogger.log({
      action: 'user.signed_in',
      context: {
        ...createAnonymousRequestContext('auth-signin'),
        user_id: user.id,
        session_id: session.id,
      },
      target_resource_id: user.id,
      target_resource_type: 'user',
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        email_verified: user.email_verified,
      },
      session: {
        id: session.id,
        token,
        fresh_until: freshUntil,
        expires_at: expiresAt,
      },
    };
  }

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    _workspaceId?: string,
  ): Promise<{ sessionId: string; token: string; fresh_until: Date; expires_at: Date }> {
    void _workspaceId;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    const sessionId = crypto.randomUUID();
    const freshUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes fresh window
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const token = JwtService.sign(
      {
        sub: user.id,
        jti: sessionId,
        email: user.email,
        name: user.full_name,
        email_verified: user.email_verified,
        fresh_until: Math.floor(freshUntil.getTime() / 1000),
      },
      this.authSecret,
      { expiresInSeconds: 14 * 24 * 60 * 60 },
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        user_id: user.id,
        token,
        token_hash: tokenHash,
        fresh_until: freshUntil,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    return {
      sessionId: session.id,
      token,
      fresh_until: freshUntil,
      expires_at: expiresAt,
    };
  }

  async requestPasswordReset(params: { email: string }): Promise<{ message: string }> {
    const email = params.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await this.prisma.verification.create({
        data: {
          identifier: email,
          value: token,
          expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });

      await this.emailSender.send({
        to: email,
        template: 'reset_password',
        locale: user.locale === 'en' ? 'en' : 'id',
        params: {
          recipient_name: user.full_name,
          url: `${this.appUrl}/reset-password?token=${token}`,
          expires_in_minutes: 30,
        },
      });
    }

    await this.auditLogger.log({
      action: 'user.password_reset_requested',
      context: createAnonymousRequestContext('auth-reset-request'),
      metadata: { email },
    });

    return {
      message:
        'If this email is registered, we have sent a password reset link. Please check your inbox.',
    };
  }

  async resetPassword(params: {
    token: string;
    new_password: string;
  }): Promise<{ success: boolean; user_id: string }> {
    const policy = validatePassword(params.new_password);
    if (!policy.valid) {
      throw new ValidationError(policy.reason ?? 'Invalid password', [
        { code: 'invalid_password', field: 'new_password', detail: policy.reason ?? '' },
      ]);
    }

    const isBreached = await this.breachedChecker.isBreached(params.new_password);
    if (isBreached) {
      throw new ValidationError(
        'This password has appeared in a data breach. Please choose a different password.',
        [
          {
            code: 'breached_password',
            field: 'new_password',
            detail: 'This password has appeared in a data breach.',
          },
        ],
      );
    }

    const verification = await this.prisma.verification.findFirst({
      where: {
        value: params.token,
        expires_at: { gt: new Date() },
      },
    });

    if (!verification) {
      throw new ValidationError('Invalid or expired reset token.', [
        { code: 'invalid_token', field: 'token', detail: 'Token is expired or invalid' },
      ]);
    }

    const user = await this.prisma.user.findUnique({
      where: { email: verification.identifier },
    });
    if (!user) {
      throw new ValidationError('User not found.', [
        { code: 'user_not_found', field: 'email', detail: 'User not found' },
      ]);
    }

    const passwordHash = PasswordHasher.hash(params.new_password);

    const updated = await this.prisma.account.updateMany({
      where: { user_id: user.id, provider_id: 'credential' },
      data: { password: passwordHash },
    });
    if (updated.count === 0) {
      // Someone who has only ever signed in with Google or GitHub has no
      // credential row, so the update above matched nothing. The reset email is
      // also how they add a password (Settings, Sign-in methods), so create it.
      // The mailbox proved ownership of the address the same way sign-up does.
      await this.prisma.account.create({
        data: {
          user_id: user.id,
          provider_id: 'credential',
          account_id: user.id,
          password: passwordHash,
        },
      });
    }

    // Single use: delete verification token
    await this.prisma.verification.deleteMany({
      where: { id: verification.id },
    });

    // Revoke all existing sessions for this user (Security requirement)
    await this.prisma.session.updateMany({
      where: { user_id: user.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    await this.auditLogger.log({
      action: 'user.password_reset_completed',
      context: {
        ...createAnonymousRequestContext('auth-reset-completed'),
        user_id: user.id,
      },
      target_resource_id: user.id,
      target_resource_type: 'user',
    });

    return { success: true, user_id: user.id };
  }

  async verifyEmail(params: {
    token: string;
  }): Promise<{ verified: boolean; user_id: string; email: string }> {
    const verification = await this.prisma.verification.findFirst({
      where: {
        value: params.token,
        expires_at: { gt: new Date() },
      },
    });

    if (!verification) {
      throw new ValidationError('Invalid or expired verification token.', [
        { code: 'invalid_token', field: 'token', detail: 'Token is expired or invalid' },
      ]);
    }

    const user = await this.prisma.user.findUnique({
      where: { email: verification.identifier },
    });
    if (!user) {
      throw new ValidationError('User not found.', [
        { code: 'user_not_found', field: 'email', detail: 'User not found' },
      ]);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verified_at: new Date(),
      },
    });

    await this.prisma.verification.deleteMany({
      where: { id: verification.id },
    });

    // Hook: Create provisional workspace "My workspace" idempotently (WP-M0-26, FR-AUTH-10)
    if (this.prisma.workspaceMember && this.prisma.workspace) {
      const existingMembership = await this.prisma.workspaceMember.findFirst({
        where: { user_id: user.id },
      });
      if (!existingMembership) {
        const workspace = await this.prisma.workspace.create({
          data: {
            workspace_name: 'My workspace',
            workspace_slug: `my-workspace-${user.id.substring(0, 8)}`,
            owner_user_id: user.id,
            status: 'active',
            subscription_tier: 'growth',
            default_locale: (user as { locale?: string }).locale ?? 'id',
            timezone: (user as { timezone?: string }).timezone ?? 'Asia/Jakarta',
            members: {
              create: {
                user_id: user.id,
                role: 'owner',
                specialist_scope: 'all',
              },
            },
          },
        });

        await this.auditLogger.log({
          action: 'workspace.created',
          context: {
            ...createAnonymousRequestContext('workspace-provisional-created'),
            user_id: user.id,
            workspace_id: workspace.id,
          },
          target_resource_id: workspace.id,
          target_resource_type: 'workspace',
          metadata: {
            is_provisional: true,
            workspace_slug: workspace.workspace_slug,
          },
        });
      }
    }

    await this.auditLogger.log({
      action: 'user.email_verified',
      context: {
        ...createAnonymousRequestContext('auth-verify-email'),
        user_id: user.id,
      },
      target_resource_id: user.id,
      target_resource_type: 'user',
      metadata: { email: user.email },
    });

    return { verified: true, user_id: user.id, email: user.email };
  }

  async reauthenticate(
    userId: string,
    password: string,
    sessionId: string,
  ): Promise<{ refreshed_token: string; fresh_until: Date }> {
    const credAccount = await this.prisma.account.findFirst({
      where: { user_id: userId, provider_id: 'credential' },
    });

    if (!credAccount?.password || !PasswordHasher.verify(password, credAccount.password)) {
      throw new UnauthorizedError('Invalid password.');
    }

    return this.markFresh(userId, sessionId);
  }

  /**
   * Opens a new 15-minute fresh window on an existing session and re-signs its
   * token with the new `fresh_until`. Shared by the password and the OAuth
   * re-confirm paths so the window is defined in one place.
   */
  async markFresh(
    userId: string,
    sessionId: string,
  ): Promise<{ refreshed_token: string; fresh_until: Date }> {
    const freshUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    // updateMany with the owner in the filter: a session id that is not this
    // user's matches nothing instead of freshening someone else's session.
    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, user_id: userId, revoked_at: null },
      data: { fresh_until: freshUntil },
    });
    if (updated.count === 0) {
      throw new UnauthorizedError('Session not found.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const token = JwtService.sign(
      {
        sub: userId,
        jti: sessionId,
        email: user?.email ?? '',
        name: user?.full_name ?? '',
        email_verified: user?.email_verified ?? false,
        fresh_until: Math.floor(freshUntil.getTime() / 1000),
      },
      this.authSecret,
      { expiresInSeconds: 14 * 24 * 60 * 60 },
    );

    return {
      refreshed_token: token,
      fresh_until: freshUntil,
    };
  }

  async signOut(sessionIdOrToken: string): Promise<void> {
    let sessionId = sessionIdOrToken;
    if (sessionIdOrToken.includes('.')) {
      const claims = JwtService.verify(sessionIdOrToken, this.authSecret);
      if (claims?.jti) {
        sessionId = claims.jti;
      }
    }

    await this.prisma.session.updateMany({
      where: {
        OR: [{ id: sessionId }, { token: sessionIdOrToken }],
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });

    await this.auditLogger.log({
      action: 'session.revoked',
      context: createAnonymousRequestContext('auth-signout'),
      metadata: { sessionId },
    });
  }

  async resolveSessionFromToken(token: string): Promise<ResolvedAuthSession | null> {
    const claims = JwtService.verify(token, this.authSecret);
    if (!claims || !claims.sub || !claims.jti) {
      return null;
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: claims.jti,
        user_id: claims.sub,
        revoked_at: null,
      },
      include: {
        user: {
          include: {
            staff_profile: true,
            memberships: {
              include: {
                specialists: true,
              },
            },
          },
        },
      },
    });

    if (!session || !session.user) {
      return null;
    }

    if (session.expires_at && session.expires_at < new Date()) {
      return null;
    }

    const memberships = (
      session.user.memberships as Array<{
        workspace_id: string;
        role: string;
        specialist_scope?: string | null;
        specialists?: Array<{ agent_slug: string }>;
      }>
    ).map((m) => ({
      workspaceId: m.workspace_id,
      role: m.role as UserRole,
      specialistScope: (m.specialist_scope ?? 'all') as 'all' | 'selected',
      allowedSpecialists: m.specialists?.map((s) => s.agent_slug),
    }));

    return {
      userId: session.user_id,
      sessionId: session.id,
      email: claims.email,
      name: claims.name,
      emailVerified: session.user.email_verified,
      freshUntil: session.fresh_until,
      staffRole:
        (session.user.staff_profile?.staff_role as
          | 'operator'
          | 'platform_admin'
          | 'support'
          | null) ?? null,
      memberships,
    };
  }
}
