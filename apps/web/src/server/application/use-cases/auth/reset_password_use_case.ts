import { validatePassword } from '@/server/domain/auth/password_policy';
import type { BreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface ResetPasswordInput {
  token: string;
  new_password: string;
}

export interface ResetPasswordAuthService {
  resetPassword(params: { token: string; new_password: string }): Promise<{ user_id: string }>;
}

export class ResetPasswordUseCase {
  constructor(
    private readonly authService: ResetPasswordAuthService,
    private readonly breachedChecker: BreachedPasswordChecker,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: ResetPasswordInput): Promise<{ success: boolean }> {
    const passwordCheck = validatePassword(input.new_password);
    if (!passwordCheck.valid) {
      throw new ValidationError(passwordCheck.reason ?? 'Invalid password', [
        { code: 'invalid_password', field: 'new_password', detail: passwordCheck.reason ?? '' },
      ]);
    }

    const isBreached = await this.breachedChecker.isBreached(input.new_password);
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

    const result = await this.authService.resetPassword({
      token: input.token,
      new_password: input.new_password,
    });

    await this.auditLogger.log({
      action: 'user.password_reset_completed',
      context: {
        ...createAnonymousRequestContext('auth-reset-completed'),
        user_id: result.user_id,
      },
      target_resource_id: result.user_id,
      target_resource_type: 'user',
    });

    return { success: true };
  }
}
