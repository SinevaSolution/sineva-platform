import crypto from 'node:crypto';
import type { LoginAttemptRepository } from '@/server/domain/auth/login_attempt_repository';
import { calculateLockoutState } from '@/server/domain/auth/lockout_calculator';
import type { EmailSender } from '@/server/domain/email/email_sender';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { UnauthorizedError, ForbiddenError } from '@/server/domain/errors/domain_error';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface SignInInput {
  email: string;
  password: string;
  ip_address: string;
}

export interface SignInAuthService {
  signIn(params: {
    email: string;
    password: string;
  }): Promise<{
    user: { id: string; email: string; email_verified?: boolean };
    session: { id: string; token: string; fresh_until?: Date };
  }>;
}

function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

export class SignInUseCase {
  constructor(
    private readonly authService: SignInAuthService,
    private readonly loginAttemptRepo: LoginAttemptRepository,
    private readonly emailSender: EmailSender,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: SignInInput) {
    const email = input.email.toLowerCase().trim();
    const emailHash = hashIdentifier(email);

    // 1. Check existing lockout state
    const failures = await this.loginAttemptRepo.getConsecutiveFailures(emailHash);
    const lockoutHistory = await this.loginAttemptRepo.getLockoutHistoryCount(emailHash);
    const lockoutState = calculateLockoutState(failures, lockoutHistory);

    if (lockoutState.isLocked) {
      throw new ForbiddenError(
        `Too many tries. You can try again in ${lockoutState.durationMinutes} minutes.`,
      );
    }

    try {
      const result = await this.authService.signIn({
        email,
        password: input.password,
      });

      // 2. Success: clear failure counters
      await this.loginAttemptRepo.clearAttempts(emailHash);

      // 3. Log success
      await this.auditLogger.log({
        action: 'user.signed_in',
        context: {
          ...createAnonymousRequestContext('auth-signin'),
          user_id: result.user.id,
          session_id: result.session.id,
        },
        target_resource_id: result.user.id,
        target_resource_type: 'user',
      });

      return result;
    } catch {
      // 4. Failure: record failed attempt
      await this.loginAttemptRepo.recordAttempt(emailHash, input.ip_address, false);
      const newFailures = await this.loginAttemptRepo.getConsecutiveFailures(emailHash);
      const newLockoutHistory = await this.loginAttemptRepo.getLockoutHistoryCount(emailHash);
      const newLockoutState = calculateLockoutState(newFailures, newLockoutHistory);

      if (newLockoutState.isLocked) {
        // Newly locked: send alert email & log
        await this.emailSender.send({
          to: email,
          template: 'lockout_notice',
          locale: 'id',
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

      await this.auditLogger.log({
        action: 'user.sign_in_failed',
        context: createAnonymousRequestContext('auth-failed'),
        metadata: {
          emailHash,
        },
      });

      throw new UnauthorizedError(
        'That email or password does not match. Try again or reset your password.',
      );
    }
  }
}
