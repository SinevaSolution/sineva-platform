import type { OAuthProfile } from '@/server/domain/auth/oauth_provider';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { AccountRepository } from '@/server/domain/repositories/account_repository';
import { requireFreshSession } from '@/server/domain/auth/fresh_session';
import { ConflictError } from '@/server/domain/errors/domain_error';

export interface LinkAccountInput {
  userId: string;
  profile: OAuthProfile;
  requestContext: RequestContext;
}

export class LinkAccountUseCase {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: LinkAccountInput): Promise<void> {
    const { userId, profile, requestContext } = input;

    // Enforce fresh session for linking actions (FR-AUTH-01c)
    requireFreshSession(requestContext);

    // Check if account already exists
    const existingEntry = await this.accountRepo.findByProviderAndAccountId(
      profile.provider,
      profile.provider_account_id,
    );

    if (existingEntry) {
      if (existingEntry.account.user_id !== userId) {
        throw new ConflictError(
          'Account',
          'This provider account is already linked to another Sineva user.',
          [
            {
              code: 'account_in_use',
              field: 'provider',
              detail: 'This provider account is already linked to another Sineva user.',
            },
          ],
        );
      }
      return; // Already linked to this user
    }

    // One account per provider and person: a second Google login would leave
    // the sign-in methods page unable to say which one a "Disconnect" removes.
    const own = await this.accountRepo.findByUserId(userId);
    if (own.some((a) => a.provider_id === profile.provider)) {
      throw new ConflictError('Account', 'A different account of this provider is already linked.', [
        {
          code: 'provider_already_linked',
          field: 'provider',
          detail: 'Disconnect the linked account of this provider first.',
        },
      ]);
    }

    await this.accountRepo.create({
      user_id: userId,
      provider_id: profile.provider,
      account_id: profile.provider_account_id,
      provider_email: profile.email,
      provider_username: profile.username ?? null,
    });

    await this.auditLogger.log({
      action: 'user.oauth_linked',
      context: requestContext,
      metadata: {
        provider: profile.provider,
        provider_account_id: profile.provider_account_id,
      },
    });
  }
}
