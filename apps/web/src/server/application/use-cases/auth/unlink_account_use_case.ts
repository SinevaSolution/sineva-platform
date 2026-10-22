import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { AccountRepository } from '@/server/domain/repositories/account_repository';
import { requireFreshSession } from '@/server/domain/auth/fresh_session';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';

export interface UnlinkAccountInput {
  userId: string;
  provider: string;
  requestContext: RequestContext;
}

export class UnlinkAccountUseCase {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: UnlinkAccountInput): Promise<void> {
    const { userId, provider, requestContext } = input;

    // Enforce fresh session for unlinking actions (FR-AUTH-01c)
    requireFreshSession(requestContext);

    // Fetch all accounts for user
    const accounts = await this.accountRepo.findByUserId(userId);

    const targetAccount = accounts.find((a) => a.provider_id === provider);
    if (!targetAccount) {
      throw new NotFoundError('Account', provider);
    }

    // Server-enforced protection: The last sign-in method cannot be removed (FR-AUTH-01c)
    if (accounts.length <= 1) {
      throw new ValidationError(
        'Cannot unlink the last remaining sign-in method on your account. Please set up another sign-in method first.',
        [
          {
            code: 'cannot_remove_last_sign_in_method',
            field: 'provider',
            detail: 'At least one sign-in method must remain linked to your account.',
          },
        ],
      );
    }

    await this.accountRepo.delete(targetAccount.id);

    await this.auditLogger.log({
      action: 'user.oauth_unlinked',
      context: requestContext,
      metadata: {
        provider,
        account_id: targetAccount.account_id,
      },
    });
  }
}
