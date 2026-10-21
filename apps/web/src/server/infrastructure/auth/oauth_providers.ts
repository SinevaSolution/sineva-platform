import 'server-only';
import type {
  OAuthProfile,
  OAuthProvider,
  SupportedOAuthProvider,
} from '@/server/domain/auth/oauth_provider';
import { ValidationError, DependencyUnavailableError } from '@/server/domain/errors/domain_error';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  emailsEndpoint?: string;
}

export class GoogleOAuthProvider implements OAuthProvider {
  readonly provider: SupportedOAuthProvider = 'google';
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly userinfoEndpoint: string;

  constructor(config: OAuthProviderConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.authorizationEndpoint =
      config.authorizationEndpoint ?? 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenEndpoint =
      config.tokenEndpoint ?? 'https://oauth2.googleapis.com/token';
    this.userinfoEndpoint =
      config.userinfoEndpoint ?? 'https://openidconnect.googleapis.com/v1/userinfo';
  }

  getAuthorizationUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthProfile> {
    let tokenRes: Response;
    try {
      tokenRes = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: params.code,
          code_verifier: params.codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: params.redirectUri,
        }),
      });
    } catch (err) {
      throw new DependencyUnavailableError(
        `Failed to reach Google token endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!tokenRes.ok) {
      throw new ValidationError('Failed to exchange authorization code with Google', [
        { code: 'oauth_exchange_failed', field: 'code', detail: `Google returned ${tokenRes.status}` },
      ]);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new ValidationError('Google did not return an access token', [
        { code: 'oauth_missing_token', field: 'code', detail: 'Missing access_token' },
      ]);
    }

    let userinfoRes: Response;
    try {
      userinfoRes = await fetch(this.userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      throw new DependencyUnavailableError(
        `Failed to reach Google userinfo endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!userinfoRes.ok) {
      throw new ValidationError('Failed to fetch user profile from Google', [
        { code: 'oauth_profile_failed', field: 'access_token', detail: `Google returned ${userinfoRes.status}` },
      ]);
    }

    const userInfo = (await userinfoRes.json()) as {
      sub: string;
      email: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    // Google: accept the email as verified only when email_verified is true (FR-AUTH-01a)
    if (!userInfo.email_verified) {
      throw new ValidationError('The email address associated with your Google account is not verified.', [
        {
          code: 'unverified_provider_email',
          field: 'email',
          detail: 'Google email must be verified before sign-in',
        },
      ]);
    }

    return {
      provider: 'google',
      provider_account_id: userInfo.sub,
      email: userInfo.email.trim().toLowerCase(),
      email_verified: true,
      full_name: userInfo.name ?? null,
      avatar_url: userInfo.picture ?? null,
      username: null,
    };
  }
}

export class GitHubOAuthProvider implements OAuthProvider {
  readonly provider: SupportedOAuthProvider = 'github';
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly userinfoEndpoint: string;
  private readonly emailsEndpoint: string;

  constructor(config: OAuthProviderConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.authorizationEndpoint =
      config.authorizationEndpoint ?? 'https://github.com/login/oauth/authorize';
    this.tokenEndpoint =
      config.tokenEndpoint ?? 'https://github.com/login/oauth/access_token';
    this.userinfoEndpoint =
      config.userinfoEndpoint ?? 'https://api.github.com/user';
    this.emailsEndpoint =
      config.emailsEndpoint ?? 'https://api.github.com/user/emails';
  }

  getAuthorizationUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthProfile> {
    let tokenRes: Response;
    try {
      tokenRes = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: params.code,
          code_verifier: params.codeVerifier,
          redirect_uri: params.redirectUri,
        }),
      });
    } catch (err) {
      throw new DependencyUnavailableError(
        `Failed to reach GitHub token endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!tokenRes.ok) {
      throw new ValidationError('Failed to exchange authorization code with GitHub', [
        { code: 'oauth_exchange_failed', field: 'code', detail: `GitHub returned ${tokenRes.status}` },
      ]);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      throw new ValidationError(tokenData.error ?? 'GitHub did not return an access token', [
        { code: 'oauth_missing_token', field: 'code', detail: tokenData.error ?? 'Missing access_token' },
      ]);
    }

    // Fetch user profile
    let userRes: Response;
    try {
      userRes = await fetch(this.userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Sineva-Platform',
        },
      });
    } catch (err) {
      throw new DependencyUnavailableError(
        `Failed to reach GitHub user endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!userRes.ok) {
      throw new ValidationError('Failed to fetch user profile from GitHub', [
        { code: 'oauth_profile_failed', field: 'access_token', detail: `GitHub returned ${userRes.status}` },
      ]);
    }

    const userData = (await userRes.json()) as {
      id: number;
      login: string;
      name?: string | null;
      avatar_url?: string | null;
    };

    // Fetch user emails to locate primary verified email
    let emailsRes: Response;
    try {
      emailsRes = await fetch(this.emailsEndpoint, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Sineva-Platform',
        },
      });
    } catch (err) {
      throw new DependencyUnavailableError(
        `Failed to reach GitHub emails endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!emailsRes.ok) {
      throw new ValidationError('Failed to fetch user emails from GitHub', [
        { code: 'oauth_emails_failed', field: 'access_token', detail: `GitHub returned ${emailsRes.status}` },
      ]);
    }

    const emailsData = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    // Use only the primary, verified email per FR-AUTH-01b
    const primaryVerified = emailsData.find((e) => e.primary && e.verified);
    if (!primaryVerified) {
      // Exact copy of FR-AUTH-01b
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

    return {
      provider: 'github',
      provider_account_id: String(userData.id), // numeric ID as string per task 3 (never login)
      email: primaryVerified.email.trim().toLowerCase(),
      email_verified: true,
      full_name: userData.name ?? userData.login,
      avatar_url: userData.avatar_url ?? null,
      username: userData.login,
    };
  }
}
