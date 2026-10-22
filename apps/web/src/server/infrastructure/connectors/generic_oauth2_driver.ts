import 'server-only';
import {
  ConnectorAuthError,
  ConnectorUnreachableError,
  ConnectorUnsupportedError,
  type AccountIdentity,
  type ActionDefinition,
  type AuthorizeInput,
  type ConnectorDriver,
  type ConnectorHttpClient,
  type ConnectorHttpResponse,
  type OAuthConfig,
  type ProviderManifest,
  type TokenSet,
} from '@/server/domain/connections/connector';

export interface OAuthClientCredentials {
  client_id: string;
  client_secret: string;
}

const KNOWN_ERRORS = ['invalid_grant', 'invalid_client', 'access_denied', 'invalid_request'] as const;

function readPath(value: unknown, path: string): string | null {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'string' && current.length > 0) return current;
  if (typeof current === 'number') return String(current);
  return null;
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Authorization code flow driven entirely by a provider manifest (ADR-0037):
 * which URLs, how the client authenticates, form or JSON bodies, whether PKCE
 * and scopes are sent, where the account identity comes from. A provider whose
 * behavior does not fit these switches gets its own driver class instead of
 * another flag here.
 *
 * Failures carry a code and a status only. A token endpoint answer holds codes
 * and tokens, so no error, and nothing this class throws, quotes a body.
 */
export class GenericOAuth2Driver implements ConnectorDriver {
  readonly provider_id: string;
  readonly auth_type = 'oauth2_pkce' as const;
  private readonly oauth: OAuthConfig;

  constructor(
    private readonly manifest: ProviderManifest,
    private readonly http: ConnectorHttpClient,
    private readonly credentials: OAuthClientCredentials,
  ) {
    if (!manifest.oauth) {
      throw new Error(`Provider ${manifest.provider_id} has no OAuth configuration`);
    }
    this.provider_id = manifest.provider_id;
    this.oauth = manifest.oauth;
  }

  authorize(input: AuthorizeInput): { url: string } {
    const url = new URL(this.oauth.authorize_url);
    const params = url.searchParams;
    params.set('response_type', 'code');
    params.set('client_id', input.client_id);
    params.set('redirect_uri', input.redirect_uri);
    params.set('state', input.state);
    if (this.oauth.send_scope_param && input.scopes.length > 0) {
      params.set('scope', input.scopes.join(this.oauth.scope_separator));
    }
    if (this.oauth.pkce && input.code_challenge) {
      params.set('code_challenge', input.code_challenge);
      params.set('code_challenge_method', 'S256');
    }
    if (input.nonce && input.scopes.includes('openid')) {
      params.set('nonce', input.nonce);
    }
    for (const [key, value] of Object.entries(this.oauth.extra_authorize_params)) {
      params.set(key, value);
    }
    return { url: url.toString() };
  }

  async exchange(input: { code: string; redirect_uri: string; code_verifier?: string }): Promise<TokenSet> {
    const fields: Record<string, string> = {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirect_uri,
    };
    if (this.oauth.pkce && input.code_verifier) fields.code_verifier = input.code_verifier;
    return this.tokenRequest(fields);
  }

  async refresh(input: { refresh_token: string }): Promise<TokenSet> {
    if (this.oauth.token_lifetime === 'non_expiring') {
      throw new ConnectorUnsupportedError('refresh');
    }
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: input.refresh_token });
  }

  async revoke(input: { token: string; token_type: 'access_token' | 'refresh_token' }): Promise<boolean> {
    if (!this.oauth.revoke_url) return false;
    try {
      const response = await this.http.request({
        provider_id: this.provider_id,
        method: 'POST',
        url: this.oauth.revoke_url,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: input.token, token_type_hint: input.token_type }).toString(),
      });
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      // Best effort by design (FR-CONN-18 order: revoke, then erase): an
      // unreachable provider must not keep a person from disconnecting.
      if (error instanceof ConnectorUnreachableError) return false;
      throw error;
    }
  }

  async whoami(input: {
    access_token?: string;
    token_account?: Record<string, unknown> | null;
    credentials?: Record<string, string>;
  }): Promise<AccountIdentity> {
    const source = this.oauth.whoami;
    if (source.source === 'token_response') {
      return {
        external_account_id: readPath(input.token_account ?? null, source.account_id_path),
        account_label: readPath(input.token_account ?? null, source.account_label_path),
      };
    }
    if (!input.access_token) throw new ConnectorUnsupportedError('whoami');
    const response = await this.http.request({
      provider_id: this.provider_id,
      method: 'GET',
      url: source.url,
      headers: { Authorization: `Bearer ${input.access_token}`, Accept: 'application/json', ...(source.headers ?? {}) },
    });
    this.throwForStatus(response, false);
    const body = parseJson(response.body);
    return {
      external_account_id: readPath(body, source.account_id_path),
      account_label: readPath(body, source.account_label_path),
    };
  }

  actions(): ActionDefinition[] {
    return this.manifest.actions;
  }

  // --- internals ----------------------------------------------------------

  private async tokenRequest(fields: Record<string, string>): Promise<TokenSet> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const body: Record<string, string> = { ...fields };
    if (this.oauth.client_auth === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${this.credentials.client_id}:${this.credentials.client_secret}`).toString('base64')}`;
    } else {
      body.client_id = this.credentials.client_id;
      body.client_secret = this.credentials.client_secret;
    }
    let serialized: string;
    if (this.oauth.token_request_format === 'json') {
      headers['Content-Type'] = 'application/json';
      serialized = JSON.stringify(body);
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      serialized = new URLSearchParams(body).toString();
    }

    const response = await this.http.request({
      provider_id: this.provider_id,
      method: 'POST',
      url: this.oauth.token_url,
      headers,
      body: serialized,
    });
    this.throwForStatus(response, true);
    return this.parseTokens(response);
  }

  /** 5xx and 429 are the provider's problem and retryable; a 4xx answer is a refusal and is not. */
  private throwForStatus(response: ConnectorHttpResponse, tokenEndpoint: boolean): void {
    if (response.status >= 200 && response.status < 300) return;
    if (response.status >= 500 || response.status === 429) {
      throw new ConnectorUnreachableError(response.status);
    }
    const code = readPath(parseJson(response.body), 'error');
    const known = (KNOWN_ERRORS as readonly string[]).includes(code ?? '') ? (code as (typeof KNOWN_ERRORS)[number]) : null;
    throw new ConnectorAuthError(tokenEndpoint ? (known ?? 'unknown') : 'unknown', response.status);
  }

  private parseTokens(response: ConnectorHttpResponse): TokenSet {
    const body = parseJson(response.body);
    const access = body?.access_token;
    if (!body || typeof access !== 'string' || access.length === 0) {
      // A 2xx that is not a token response: treat as the provider misbehaving.
      throw new ConnectorAuthError('unknown', response.status);
    }
    const expires = body.expires_in;
    const expiresIn =
      this.oauth.token_lifetime === 'non_expiring'
        ? null
        : typeof expires === 'number'
          ? expires
          : typeof expires === 'string' && /^\d+$/.test(expires)
            ? Number(expires)
            : null;
    const scope = body.scope;
    const { access_token: _access, refresh_token: _refresh, ...account } = body;
    void _access;
    void _refresh;
    return {
      access_token: access,
      refresh_token: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
      expires_in: expiresIn,
      scopes: typeof scope === 'string' ? scope.split(/[ ,]+/).filter(Boolean) : null,
      token_type: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
      account,
    };
  }
}
