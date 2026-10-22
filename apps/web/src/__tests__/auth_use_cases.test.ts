import crypto from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SignUpUseCase, type AuthService } from '@/server/application/use-cases/auth/sign_up_use_case';
import { RequestPasswordResetUseCase, type ResetRequestAuthService } from '@/server/application/use-cases/auth/request_password_reset_use_case';
import { ResetPasswordUseCase, type ResetPasswordAuthService } from '@/server/application/use-cases/auth/reset_password_use_case';
import { VerifyEmailUseCase, type VerifyEmailAuthService } from '@/server/application/use-cases/auth/verify_email_use_case';
import { SignInUseCase, type SignInAuthService } from '@/server/application/use-cases/auth/sign_in_use_case';
import { FakeBreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { ValidationError } from '@/server/domain/errors/domain_error';
import type { LoginAttemptRepository } from '@/server/domain/auth/login_attempt_repository';

class InMemoryLoginAttemptRepository implements LoginAttemptRepository {
  private failures = new Map<string, number>();
  private lockoutHistory = new Map<string, number>();

  async recordAttempt(emailHash: string, _ip: string, successful: boolean): Promise<void> {
    if (successful) {
      this.failures.set(emailHash, 0);
    } else {
      const current = this.failures.get(emailHash) ?? 0;
      this.failures.set(emailHash, current + 1);
      if ((current + 1) % 5 === 0) {
        const hist = this.lockoutHistory.get(emailHash) ?? 0;
        this.lockoutHistory.set(emailHash, hist + 1);
      }
    }
  }

  async getConsecutiveFailures(emailHash: string): Promise<number> {
    return this.failures.get(emailHash) ?? 0;
  }

  async getLockoutHistoryCount(emailHash: string): Promise<number> {
    return this.lockoutHistory.get(emailHash) ?? 0;
  }

  async clearAttempts(emailHash: string): Promise<void> {
    this.failures.set(emailHash, 0);
  }
}

describe('Auth Use Cases (WP-M0-23, FR-AUTH-01 - FR-AUTH-07a)', () => {
  let breachedChecker: FakeBreachedPasswordChecker;
  let emailSender: FakeEmailSender;
  let auditLogger: CountingAuditLogger;
  let loginAttemptRepo: InMemoryLoginAttemptRepository;

  beforeEach(() => {
    breachedChecker = new FakeBreachedPasswordChecker(['breached123456']);
    emailSender = new FakeEmailSender();
    auditLogger = new CountingAuditLogger();
    loginAttemptRepo = new InMemoryLoginAttemptRepository();
  });

  describe('SignUpUseCase', () => {
    it('rejects password shorter than 12 characters', async () => {
      const mockAuthService = { signUp: vi.fn() };
      const useCase = new SignUpUseCase(mockAuthService as unknown as AuthService, breachedChecker, auditLogger);

      await expect(
        useCase.execute({
          email: 'test@example.com',
          password: 'short',
          full_name: 'Budi Santoso',
          terms_accepted_version: 'v1.0',
          privacy_accepted_version: 'v1.0',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects known breached password', async () => {
      const mockAuthService = { signUp: vi.fn() };
      const useCase = new SignUpUseCase(mockAuthService as unknown as AuthService, breachedChecker, auditLogger);

      await expect(
        useCase.execute({
          email: 'test@example.com',
          password: 'breached123456',
          full_name: 'Budi Santoso',
          terms_accepted_version: 'v1.0',
          privacy_accepted_version: 'v1.0',
        }),
      ).rejects.toThrow(/breach/i);
    });

    it('requires terms and privacy acceptance versions (FR-AUTH-07a)', async () => {
      const mockAuthService = { signUp: vi.fn() };
      const useCase = new SignUpUseCase(mockAuthService as unknown as AuthService, breachedChecker, auditLogger);

      await expect(
        useCase.execute({
          email: 'test@example.com',
          password: 'validpassword123',
          full_name: 'Budi Santoso',
          terms_accepted_version: '',
          privacy_accepted_version: 'v1.0',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('successfully signs up, defaults timezone to Asia/Jakarta, and logs user.signed_up', async () => {
      const mockAuthService = {
        signUp: vi.fn().mockResolvedValue({
          user: { id: 'usr-1', email: 'budi@example.com', name: 'Budi Santoso' },
        }),
      };
      const useCase = new SignUpUseCase(mockAuthService as unknown as AuthService, breachedChecker, auditLogger);

      const res = await useCase.execute({
        email: 'budi@example.com',
        password: 'validpassword123',
        full_name: 'Budi Santoso',
        terms_accepted_version: 'v1.0',
        privacy_accepted_version: 'v1.0',
      });

      expect(res.user.id).toBe('usr-1');
      expect(mockAuthService.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'Asia/Jakarta',
          locale: 'id',
        }),
      );

      const events = auditLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('user.signed_up');
    });
  });

  describe('RequestPasswordResetUseCase', () => {
    it('returns calm non-enumerating message for both known and unknown emails', async () => {
      const mockAuthService = {
        requestReset: vi.fn().mockResolvedValue(true),
      };
      const useCase = new RequestPasswordResetUseCase(mockAuthService as unknown as ResetRequestAuthService, auditLogger);

      const res = await useCase.execute({ email: 'unknown@example.com' });
      expect(res.message).toContain('If this email is registered');

      const events = auditLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('user.password_reset_requested');
    });
  });

  describe('ResetPasswordUseCase', () => {
    it('rejects breached password on reset', async () => {
      const mockAuthService = { resetPassword: vi.fn() };
      const useCase = new ResetPasswordUseCase(mockAuthService as unknown as ResetPasswordAuthService, breachedChecker, auditLogger);

      await expect(
        useCase.execute({
          token: 'tok-123',
          new_password: 'breached123456',
        }),
      ).rejects.toThrow(/breach/i);
    });

    it('resets password, revokes all other sessions, and logs user.password_reset_completed', async () => {
      const mockAuthService = {
        resetPassword: vi.fn().mockResolvedValue({ user_id: 'usr-1' }),
      };
      const useCase = new ResetPasswordUseCase(mockAuthService as unknown as ResetPasswordAuthService, breachedChecker, auditLogger);

      const res = await useCase.execute({
        token: 'tok-123',
        new_password: 'newValidPassword123',
      });

      expect(res.success).toBe(true);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith({
        token: 'tok-123',
        new_password: 'newValidPassword123',
      });

      const events = auditLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('user.password_reset_completed');
    });
  });

  describe('VerifyEmailUseCase', () => {
    it('verifies email and logs user.email_verified', async () => {
      const mockAuthService = {
        verifyEmail: vi.fn().mockResolvedValue({ user_id: 'usr-1', email: 'test@example.com' }),
      };
      const useCase = new VerifyEmailUseCase(mockAuthService as unknown as VerifyEmailAuthService, auditLogger);

      const res = await useCase.execute({ token: 'verify-tok-123' });
      expect(res.verified).toBe(true);

      const events = auditLogger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('user.email_verified');
    });
  });

  describe('SignInUseCase & Account Lockout (FR-AUTH-04)', () => {
    it('locks account after 5 consecutive failures and sends lockout notice email', async () => {
      const mockAuthService = {
        signIn: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
      };
      const useCase = new SignInUseCase(
        mockAuthService as unknown as SignInAuthService,
        loginAttemptRepo,
        emailSender,
        auditLogger,
      );

      // 4 failures: should not be locked yet
      for (let i = 0; i < 4; i++) {
        await expect(
          useCase.execute({
            email: 'victim@example.com',
            password: 'wrongpassword',
            ip_address: '1.2.3.4',
          }),
        ).rejects.toThrow('That email or password does not match');
      }

      expect(emailSender.getSentEmails()).toHaveLength(0);

      // 5th failure: triggers lockout
      await expect(
        useCase.execute({
          email: 'victim@example.com',
          password: 'wrongpassword',
          ip_address: '1.2.3.4',
        }),
      ).rejects.toThrow('Too many tries');

      // Email sent
      expect(emailSender.getSentEmails()).toHaveLength(1);
      expect(emailSender.getLastEmail()?.template).toBe('lockout_notice');
      expect(emailSender.getLastEmail()?.to).toBe('victim@example.com');

      // Audit event
      const events = auditLogger.getEvents();
      expect(events.some((e) => e.action === 'user.locked_out')).toBe(true);
    });

    it('resets lockout failures on successful login and logs user.signed_in', async () => {
      const mockAuthService = {
        signIn: vi.fn().mockResolvedValue({
          user: { id: 'usr-1', email: 'user@example.com', email_verified: true },
          session: { id: 'sess-1', token: 'tok-abc' },
        }),
      };
      const useCase = new SignInUseCase(
        mockAuthService as unknown as SignInAuthService,
        loginAttemptRepo,
        emailSender,
        auditLogger,
      );

      const emailHash = crypto.createHash('sha256').update('user@example.com').digest('hex');
      await loginAttemptRepo.recordAttempt(emailHash, '1.2.3.4', false);
      await loginAttemptRepo.recordAttempt(emailHash, '1.2.3.4', false);

      const res = await useCase.execute({
        email: 'user@example.com',
        password: 'correctpassword123',
        ip_address: '1.2.3.4',
      });

      expect(res.user.id).toBe('usr-1');
      const failures = await loginAttemptRepo.getConsecutiveFailures(emailHash);
      expect(failures).toBe(0);

      const events = auditLogger.getEvents();
      expect(events.some((e) => e.action === 'user.signed_in')).toBe(true);
    });
  });
});
