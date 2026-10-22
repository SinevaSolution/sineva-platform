import type { OAuthProfile } from '@/server/domain/auth/oauth_provider';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { AccountRepository } from '@/server/domain/repositories/account_repository';
import { ForbiddenError } from '@/server/domain/errors/domain_error';

/** Port: extends the freshness window of an existing session (FR-AUTH-06). */
export interface SessionFreshness {
  markFresh(
    userId: string,
    sessionId: string,
  ): Promise<{ refreshed_token: string; fresh_until: Date }>;
}

export interface OAuthReauthenticateInput {
  profile: OAuthProfile;
  requestContext: RequestContext;
}

/**
 * Re-confirms a signed-in person through the provider they already linked,
 * for people who have no password. The provider account the browser just
 * proved must be linked to this very user; the session is never replaced, only
 * its freshness is extended.
 */
export class OAuthReauthenticateUseCase {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly sessions: SessionFreshness,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(
    input: OAuthReauthenticateInput,
  ): Promise<{ refreshed_token: string; fresh_until: Date }> {
    const { profile, requestContext } = input;
    const linked = await this.accountRepo.findByProviderAndAccountId(
      profile.provider,
      profile.provider_account_id,
    );
    if (!linked || linked.account.user_id !== requestContext.user_id) {
      throw new ForbiddenError('This account is not linked to the signed-in user.', [
        {
          code: 'oauth_account_mismatch',
          field: 'provider',
          detail: 'Use the account you linked to Sineva.',
        },
      ]);
    }

    const result = await this.sessions.markFresh(requestContext.user_id, requestContext.session_id);

    await this.auditLogger.log({
      action: 'user.reauthenticated',
      context: requestContext,
      metadata: { provider: profile.provider, auth_method: 'oauth' },
    });
    return result;
  }
}
