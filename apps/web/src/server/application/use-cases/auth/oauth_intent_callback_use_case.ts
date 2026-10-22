import type { OAuthProfile } from '@/server/domain/auth/oauth_provider';
import type { RequestContext } from '@/server/domain/context/request_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { sanitizeNextRedirect } from '@/server/domain/auth/safe_redirect';
import type { LinkAccountUseCase } from './link_account_use_case';
import type { OAuthReauthenticateUseCase } from './oauth_reauthenticate_use_case';

export type OAuthNotice =
  | 'linked'
  | 'reauthenticated'
  | 'mismatch'
  | 'account_in_use'
  | 'provider_already_linked'
  | 'fresh_required'
  | 'not_configured'
  | 'cancelled'
  | 'failed';

export interface OAuthIntentCallbackInput {
  intent: 'link' | 'reauth';
  /** The user id the state cookie was issued for. */
  boundUserId?: string;
  /** The browser's current session, or null when there is none. */
  session: { userId: string; sessionId: string; freshUntil?: Date | null } | null;
  profile: OAuthProfile;
  returnTo?: string;
  requestId: string;
}

export interface OAuthIntentCallbackResult {
  /** Present only when the session token changed (re-auth). */
  sessionToken?: string;
  targetPath: string;
}

/** Adds `oauth=<notice>` to a same-origin path, keeping its other query values. */
export function withOAuthNotice(path: string | undefined, notice: OAuthNotice): string {
  const safe = sanitizeNextRedirect(path, '/');
  const url = new URL(safe, 'http://app.invalid');
  url.searchParams.set('oauth', notice);
  return `${url.pathname}${url.search}${url.hash}`;
}

const DETAIL_NOTICES: Record<string, OAuthNotice> = {
  account_in_use: 'account_in_use',
  provider_already_linked: 'provider_already_linked',
  fresh_session_required: 'fresh_required',
  oauth_account_mismatch: 'mismatch',
};

/**
 * Finishes a provider round trip that is not a sign-in: linking a provider to
 * the signed-in person, or re-confirming them. Every outcome is a redirect
 * target with a notice code, because the person is mid-redirect and a JSON
 * error page would strand them; the settings page turns the code into copy.
 */
export class OAuthIntentCallbackUseCase {
  constructor(
    private readonly link: LinkAccountUseCase,
    private readonly reauth: OAuthReauthenticateUseCase,
  ) {}

  async execute(input: OAuthIntentCallbackInput): Promise<OAuthIntentCallbackResult> {
    const { session, boundUserId, returnTo, profile } = input;

    // The state was issued to one person; a different (or missing) session at
    // the callback means the browser changed hands mid-flow.
    if (!session || !boundUserId || session.userId !== boundUserId) {
      return { targetPath: withOAuthNotice(returnTo, 'mismatch') };
    }

    const requestContext: RequestContext = {
      user_id: session.userId,
      session_id: session.sessionId,
      request_id: input.requestId,
      fresh_until: session.freshUntil ?? null,
      actor: { type: 'user', id: session.userId },
    };

    try {
      if (input.intent === 'link') {
        await this.link.execute({ userId: session.userId, profile, requestContext });
        return { targetPath: withOAuthNotice(returnTo, 'linked') };
      }
      const result = await this.reauth.execute({ profile, requestContext });
      return {
        sessionToken: result.refreshed_token,
        targetPath: withOAuthNotice(returnTo, 'reauthenticated'),
      };
    } catch (error) {
      if (error instanceof DomainError) {
        const notice = error.details.map((d) => DETAIL_NOTICES[d.code]).find(Boolean);
        return { targetPath: withOAuthNotice(returnTo, notice ?? 'failed') };
      }
      throw error;
    }
  }
}
