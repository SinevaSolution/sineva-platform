import { createHash, randomBytes } from 'node:crypto';
import {
  ConnectorUnreachableError,
  type ConnectorHttpClient,
  type ConnectorHttpRequest,
  type ConnectorHttpResponse,
  type ProviderManifest,
} from '@/server/domain/connections/connector';

// A stand-in OAuth provider for tests (WP-M2-14): authorize, token, userinfo and
// revoke behind the same HTTP port the real drivers use, so the driver, the
// flow service and the refresh worker run unchanged against it. Everything the
// plan lists is configurable: the `iss` it answers with, a scope downgrade,
// rotating refresh tokens, `invalid_grant`, outages. It enforces what a real
// provider enforces (single-use codes, PKCE, exact redirect URI, client
// authentication) so a broken driver fails here and not in production.

export interface FakeAccount {
  id: string;
  label: string;
}

export interface FakeProviderConfig {
  client_id: string;
  client_secret: string;
  /** `iss` returned on the authorization response; null omits it. */
  issuer: string | null;
  /** When set, the person "unticks" scopes: only these are granted. */
  grant_only: string[] | null;
  /** True: every refresh invalidates the presented refresh token and issues a new one. */
  rotate_refresh: boolean;
  /** Seconds. Null issues non-expiring tokens (no expiry, no refresh token). */
  access_ttl: number | null;
  /** Whether the token response lists the granted scopes. */
  report_scopes: boolean;
  /** Whether a refresh token is issued at all (offline access). */
  issue_refresh: boolean;
  require_pkce: boolean;
  /** Scopes the provider adds beyond what was asked (it must not be trusted to stay inside the bundle). */
  extra_scopes: string[];
  account: FakeAccount;
}

interface CodeRecord {
  client_id: string;
  redirect_uri: string;
  challenge: string | null;
  scopes: string[];
  used: boolean;
}

interface RefreshRecord {
  scopes: string[];
  active: boolean;
}

const b64url = (buffer: Buffer) => buffer.toString('base64url');
const sha256 = (value: string) => createHash('sha256').update(value).digest();

export class FakeConnectionOAuthProvider implements ConnectorHttpClient {
  readonly config: FakeProviderConfig;
  readonly requests: Array<{ url: string; method: string; body: string }> = [];
  readonly revoked: string[] = [];
  private readonly codes = new Map<string, CodeRecord>();
  private readonly refreshTokens = new Map<string, RefreshRecord>();
  private readonly accessTokens = new Map<string, { scopes: string[]; expires_at: number | null }>();
  private failures: Array<'network' | 500 | 503> = [];
  private invalidGrantForAll = false;
  /** Frozen clock for expiry, in ms. */
  now = Date.now();

  constructor(
    private readonly manifest: ProviderManifest,
    overrides: Partial<FakeProviderConfig> = {},
  ) {
    this.config = {
      client_id: 'client-id',
      client_secret: 'client-secret',
      issuer: manifest.oauth?.issuer ?? null,
      grant_only: null,
      rotate_refresh: false,
      access_ttl: 3600,
      report_scopes: true,
      issue_refresh: true,
      require_pkce: manifest.oauth?.pkce ?? false,
      extra_scopes: [],
      account: { id: 'acct-1', label: 'budi@example.test' },
      ...overrides,
    };
  }

  /** The next calls fail like an outage; each entry is consumed by one call. */
  failNext(...modes: Array<'network' | 500 | 503>): void {
    this.failures.push(...modes);
  }

  /** Every refresh and code exchange answers invalid_grant from now on (a revoked or expired grant). */
  revokeAllGrants(): void {
    this.invalidGrantForAll = true;
  }

  /** Invalidates one refresh token as the provider would after a rotation elsewhere. */
  invalidateRefreshToken(token: string): void {
    const record = this.refreshTokens.get(token);
    if (record) record.active = false;
  }

  /**
   * Simulates the person at the consent screen. Reads the authorization URL a
   * driver built and returns the callback URL the provider would redirect to,
   * or the error redirect when `deny` is set.
   */
  authorize(authorizationUrl: string, behavior: { deny?: boolean; iss?: string | null } = {}): string {
    const url = new URL(authorizationUrl);
    const get = (name: string) => url.searchParams.get(name);
    if (get('response_type') !== 'code') throw new Error('fake provider: response_type must be code');
    if (get('client_id') !== this.config.client_id) throw new Error('fake provider: unknown client_id');
    const redirectUri = get('redirect_uri');
    if (!redirectUri) throw new Error('fake provider: redirect_uri missing');
    const state = get('state');
    const callback = new URL(redirectUri);
    if (state) callback.searchParams.set('state', state);
    const iss = behavior.iss === undefined ? this.config.issuer : behavior.iss;
    if (iss) callback.searchParams.set('iss', iss);
    if (behavior.deny) {
      callback.searchParams.set('error', 'access_denied');
      return callback.toString();
    }
    const requested = (get('scope') ?? '').split(/[ ,]+/).filter(Boolean);
    const challenge = get('code_challenge');
    if (this.config.require_pkce) {
      if (!challenge || get('code_challenge_method') !== 'S256') throw new Error('fake provider: PKCE S256 required');
    }
    const code = `code-${randomBytes(12).toString('hex')}`;
    this.codes.set(code, {
      client_id: this.config.client_id,
      redirect_uri: redirectUri,
      challenge,
      scopes: [
        ...(this.config.grant_only ? requested.filter((scope) => this.config.grant_only!.includes(scope)) : requested),
        ...this.config.extra_scopes,
      ],
      used: false,
    });
    callback.searchParams.set('code', code);
    return callback.toString();
  }

  async request(request: ConnectorHttpRequest): Promise<ConnectorHttpResponse> {
    this.requests.push({ url: request.url, method: request.method, body: request.body ?? '' });
    const failure = this.failures.shift();
    if (failure === 'network') throw new ConnectorUnreachableError(null);
    if (failure) return json(failure, { error: 'server_error' });

    const oauth = this.manifest.oauth!;
    if (request.url === oauth.token_url) return this.token(request);
    if (request.url === oauth.revoke_url) return this.revoke(request);
    if (oauth.whoami.source === 'endpoint' && request.url === oauth.whoami.url) return this.userinfo(request);
    return json(404, { error: 'not_found' });
  }

  // --- endpoints ----------------------------------------------------------

  private params(request: ConnectorHttpRequest): URLSearchParams {
    const contentType = request.headers?.['Content-Type'] ?? request.headers?.['content-type'] ?? '';
    if (contentType.includes('json')) {
      const parsed = JSON.parse(request.body ?? '{}') as Record<string, string>;
      return new URLSearchParams(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
    }
    return new URLSearchParams(request.body ?? '');
  }

  private authenticatesClient(request: ConnectorHttpRequest, params: URLSearchParams): boolean {
    const header = request.headers?.Authorization ?? request.headers?.authorization;
    if (header?.startsWith('Basic ')) {
      const [id, secret] = Buffer.from(header.slice(6), 'base64').toString().split(':');
      return id === this.config.client_id && secret === this.config.client_secret;
    }
    return params.get('client_id') === this.config.client_id && params.get('client_secret') === this.config.client_secret;
  }

  private token(request: ConnectorHttpRequest): ConnectorHttpResponse {
    const params = this.params(request);
    if (!this.authenticatesClient(request, params)) return json(401, { error: 'invalid_client' });
    const grant = params.get('grant_type');

    if (grant === 'authorization_code') {
      if (this.invalidGrantForAll) return json(400, { error: 'invalid_grant' });
      const record = this.codes.get(params.get('code') ?? '');
      // A code works once. A second use is invalid_grant (RFC 6749 4.1.2).
      if (!record || record.used) return json(400, { error: 'invalid_grant' });
      record.used = true;
      if (record.redirect_uri !== params.get('redirect_uri')) return json(400, { error: 'invalid_grant' });
      if (record.challenge) {
        const verifier = params.get('code_verifier');
        if (!verifier || b64url(sha256(verifier)) !== record.challenge) return json(400, { error: 'invalid_grant' });
      }
      return json(200, this.issue(record.scopes, this.config.issue_refresh));
    }

    if (grant === 'refresh_token') {
      if (this.invalidGrantForAll) return json(400, { error: 'invalid_grant' });
      const presented = params.get('refresh_token') ?? '';
      const record = this.refreshTokens.get(presented);
      if (!record || !record.active) return json(400, { error: 'invalid_grant' });
      if (this.config.rotate_refresh) record.active = false;
      const issued = this.issue(record.scopes, this.config.rotate_refresh, this.config.rotate_refresh ? undefined : presented);
      return json(200, issued);
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  private issue(scopes: string[], newRefresh: boolean, keepRefresh?: string): Record<string, unknown> {
    const access = `at-${randomBytes(12).toString('hex')}`;
    const ttl = this.config.access_ttl;
    this.accessTokens.set(access, { scopes, expires_at: ttl === null ? null : this.now + ttl * 1000 });
    const body: Record<string, unknown> = { access_token: access, token_type: 'Bearer' };
    if (ttl !== null) body.expires_in = ttl;
    if (this.config.report_scopes) body.scope = scopes.join(' ');
    if (newRefresh && ttl !== null) {
      const refresh = `rt-${randomBytes(12).toString('hex')}`;
      this.refreshTokens.set(refresh, { scopes, active: true });
      body.refresh_token = refresh;
    } else if (keepRefresh) {
      body.refresh_token = keepRefresh;
    }
    // Providers that identify the account in the token response (Notion style).
    if (this.manifest.oauth?.whoami.source === 'token_response') {
      body[this.manifest.oauth.whoami.account_id_path] = this.config.account.id;
      body[this.manifest.oauth.whoami.account_label_path] = this.config.account.label;
    }
    return body;
  }

  private userinfo(request: ConnectorHttpRequest): ConnectorHttpResponse {
    const header = request.headers?.Authorization ?? '';
    const token = this.accessTokens.get(header.replace(/^Bearer /, ''));
    if (!token || (token.expires_at !== null && token.expires_at <= this.now)) return json(401, { error: 'invalid_token' });
    const oauth = this.manifest.oauth!;
    if (oauth.whoami.source !== 'endpoint') return json(404, {});
    return json(200, { [oauth.whoami.account_id_path]: this.config.account.id, [oauth.whoami.account_label_path]: this.config.account.label });
  }

  private revoke(request: ConnectorHttpRequest): ConnectorHttpResponse {
    const token = this.params(request).get('token');
    if (token) {
      this.revoked.push(token);
      this.accessTokens.delete(token);
      const refresh = this.refreshTokens.get(token);
      if (refresh) refresh.active = false;
    }
    return json(200, {});
  }

  /** The provider forgets an access token (the person revoked the app there). */
  invalidateAccessToken(token: string): void {
    this.accessTokens.delete(token);
  }

  /** Whether an access token is currently valid (for assertions about refresh results). */
  accessTokenValid(token: string): boolean {
    const record = this.accessTokens.get(token);
    return Boolean(record && (record.expires_at === null || record.expires_at > this.now));
  }

  refreshTokenActive(token: string): boolean {
    return this.refreshTokens.get(token)?.active ?? false;
  }
}

function json(status: number, body: unknown): ConnectorHttpResponse {
  return { status, body: JSON.stringify(body) };
}
