// What a page needs to know about how the signed-in person can prove who they
// are: which providers are linked, whether a password exists, and which
// providers this deployment can actually start. The members page uses it for
// the re-confirm dialog, the profile page for linking and unlinking.

export type OAuthProviderId = 'google' | 'github';

export const OAUTH_PROVIDER_IDS: readonly OAuthProviderId[] = ['google', 'github'];

export interface LinkedAccountView {
  /** `google`, `github` or `credential` (the password). */
  provider: string;
  provider_email: string | null;
  provider_username: string | null;
}

export interface SignInMethodsView {
  email: string;
  accounts: LinkedAccountView[];
  /** Providers with real credentials on this deployment. */
  configured: OAuthProviderId[];
  /** The current session is inside its fresh window, so sensitive actions need no re-confirm. */
  fresh: boolean;
}

/** The subset the re-confirm dialog needs. */
export interface ReauthMethods {
  has_password: boolean;
  /** Linked and configured: the providers that can re-confirm this person. */
  providers: OAuthProviderId[];
}

export function reauthMethodsOf(view: Pick<SignInMethodsView, 'accounts' | 'configured'>): ReauthMethods {
  const linked = new Set(view.accounts.map((a) => a.provider));
  return {
    has_password: linked.has('credential'),
    providers: OAUTH_PROVIDER_IDS.filter((p) => linked.has(p) && view.configured.includes(p)),
  };
}
