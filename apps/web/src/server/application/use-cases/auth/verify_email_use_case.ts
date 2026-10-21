import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface VerifyEmailInput {
  token: string;
}

export interface VerifyEmailAuthService {
  verifyEmail(params: { token: string }): Promise<{ user_id: string; email: string }>;
}

export class VerifyEmailUseCase {
  constructor(
    private readonly authService: VerifyEmailAuthService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: VerifyEmailInput): Promise<{ verified: boolean }> {
    const result = await this.authService.verifyEmail({ token: input.token });

    await this.auditLogger.log({
      action: 'user.email_verified',
      context: {
        ...createAnonymousRequestContext('auth-verify-email'),
        user_id: result.user_id,
      },
      target_resource_id: result.user_id,
      target_resource_type: 'user',
      metadata: {
        email: result.email,
      },
    });

    return { verified: true };
  }
}
