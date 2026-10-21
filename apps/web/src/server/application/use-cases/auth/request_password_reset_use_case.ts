import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface RequestPasswordResetInput {
  email: string;
}

export interface ResetRequestAuthService {
  requestReset(params: { email: string }): Promise<boolean>;
}

export class RequestPasswordResetUseCase {
  constructor(
    private readonly authService: ResetRequestAuthService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<{ message: string }> {
    const email = input.email.toLowerCase().trim();

    // Trigger reset flow in background without blocking or leaking status
    await this.authService.requestReset({ email });

    await this.auditLogger.log({
      action: 'user.password_reset_requested',
      context: createAnonymousRequestContext('auth-reset-request'),
      metadata: {
        email,
      },
    });

    return {
      message:
        'If this email is registered, we have sent a password reset link. Please check your inbox.',
    };
  }
}
