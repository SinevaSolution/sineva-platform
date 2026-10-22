export type SupportedOAuthProvider = 'google' | 'github';

export interface OAuthProfile {
  provider: SupportedOAuthProvider;
  provider_account_id: string; // Immutable unique ID: Google sub or GitHub numeric id
  email: string;
  email_verified: boolean;
  full_name?: string | null;
  avatar_url?: string | null;
  username?: string | null;
}

export interface OAuthProvider {
  readonly provider: SupportedOAuthProvider;
  getAuthorizationUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthProfile>;
}
