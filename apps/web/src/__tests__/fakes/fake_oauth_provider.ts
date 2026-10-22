import type {
  OAuthProfile,
  OAuthProvider,
  SupportedOAuthProvider,
} from '@/server/domain/auth/oauth_provider';
import { ValidationError } from '@/server/domain/errors/domain_error';

export class FakeOAuthProvider implements OAuthProvider {
  constructor(
    public readonly provider: SupportedOAuthProvider,
    public mockProfile?: Partial<OAuthProfile>,
    public shouldFailExchange: boolean = false,
  ) {}

  getAuthorizationUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL(`https://fake-${this.provider}.example.com/oauth/authorize`);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('redirect_uri', params.redirectUri);
    return url.toString();
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthProfile> {
    void params;
    if (this.shouldFailExchange) {
      throw new ValidationError(`Failed to exchange code with ${this.provider}`, [
        { code: 'oauth_exchange_failed', field: 'code', detail: 'Invalid code' },
      ]);
    }

    if (this.provider === 'github' && this.mockProfile?.email_verified === false) {
      throw new ValidationError(
        'Your GitHub account does not have a verified primary email address. Please verify your email on GitHub or use another sign-in method.',
        [
          {
            code: 'github_unverified_email',
            field: 'email',
            detail: 'No primary verified email found on GitHub account',
          },
        ],
      );
    }

    if (this.provider === 'google' && this.mockProfile?.email_verified === false) {
      throw new ValidationError(
        'The email address associated with your Google account is not verified.',
        [
          {
            code: 'unverified_provider_email',
            field: 'email',
            detail: 'Google email must be verified before sign-in',
          },
        ],
      );
    }

    return {
      provider: this.provider,
      provider_account_id: this.mockProfile?.provider_account_id ?? `sub_${this.provider}_123`,
      email: this.mockProfile?.email ?? `user_${this.provider}@example.com`,
      email_verified: this.mockProfile?.email_verified ?? true,
      full_name: this.mockProfile?.full_name ?? 'Test OAuth User',
      avatar_url: this.mockProfile?.avatar_url ?? null,
      username: this.mockProfile?.username ?? (this.provider === 'github' ? 'testuser' : null),
    };
  }
}
