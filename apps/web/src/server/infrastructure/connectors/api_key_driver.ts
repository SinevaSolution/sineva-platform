import 'server-only';
import {
  ConnectorAuthError,
  ConnectorUnreachableError,
  ConnectorUnsupportedError,
  type AccountIdentity,
  type ActionDefinition,
  type ApiKeyConfig,
  type AuthorizeInput,
  type ConnectorDriver,
  type ConnectorHttpClient,
  type ProviderManifest,
  type TokenSet,
} from '@/server/domain/connections/connector';
import { keyHint } from '@/server/domain/connections/key_hint';

/**
 * Driver of the pasted-key providers (Xendit, Midtrans): the "connection test" of
 * FR-CONN-29 is `whoami`. There is no sign-in, refresh or provider-side revoke:
 * a payment provider offers none for a key, so disconnecting only erases ours.
 *
 * The key is sent as the HTTP Basic user name with an empty password, the shape
 * both providers document. Nothing here quotes a response or the key: a failure is
 * a code and a status.
 */
export class ApiKeyDriver implements ConnectorDriver {
  readonly provider_id: string;
  readonly auth_type = 'api_key' as const;
  private readonly config: ApiKeyConfig;

  constructor(
    private readonly manifest: ProviderManifest,
    private readonly http: ConnectorHttpClient,
  ) {
    if (!manifest.api_key) throw new Error(`Provider ${manifest.provider_id} has no API-key configuration`);
    this.provider_id = manifest.provider_id;
    this.config = manifest.api_key;
  }

  authorize(input: AuthorizeInput): { url: string } {
    void input;
    throw new ConnectorUnsupportedError('authorize');
  }
  async exchange(): Promise<TokenSet> {
    throw new ConnectorUnsupportedError('exchange');
  }
  async refresh(): Promise<TokenSet> {
    throw new ConnectorUnsupportedError('refresh');
  }
  async revoke(): Promise<boolean> {
    return false;
  }

  async whoami(input: { credentials?: Record<string, string> }): Promise<AccountIdentity> {
    const credentials = input.credentials ?? {};
    const secretField = this.config.fields.find((field) => field.kind === 'secret');
    const secret = secretField ? credentials[secretField.field_key] : undefined;
    if (!secret) throw new ConnectorAuthError('invalid_request', 422);

    const hasEnvironment = this.config.fields.some((field) => field.field_key === 'environment');
    const environment = hasEnvironment ? credentials.environment : 'default';
    const url = environment ? this.config.test.url_by_environment[environment] : undefined;
    if (!url) throw new ConnectorAuthError('invalid_request', 422);

    const response = await this.http.request({
      provider_id: this.provider_id,
      method: this.config.test.method,
      url,
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
        Accept: 'application/json',
      },
    });

    const { accept_statuses, invalid_statuses, insufficient_statuses } = this.config.test;
    if (accept_statuses.includes(response.status)) {
      const hint = keyHint(secret);
      return { external_account_id: null, account_label: hasEnvironment ? `${hint} (${environment})` : hint };
    }
    if (invalid_statuses.includes(response.status)) throw new ConnectorAuthError('invalid_client', response.status);
    if (insufficient_statuses.includes(response.status)) throw new ConnectorAuthError('access_denied', response.status);
    if (response.status >= 500 || response.status === 429) throw new ConnectorUnreachableError(response.status);
    throw new ConnectorAuthError('unknown', response.status);
  }

  actions(): ActionDefinition[] {
    return this.manifest.actions;
  }
}
