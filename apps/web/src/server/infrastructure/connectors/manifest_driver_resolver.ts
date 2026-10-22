import 'server-only';
import { ProviderUnavailableError } from '@/server/domain/connections/connection_errors';
import type {
  ConnectorDriver,
  ConnectorHttpClient,
  ProviderManifest,
} from '@/server/domain/connections/connector';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import { GenericOAuth2Driver, type OAuthClientCredentials } from './generic_oauth2_driver';

export interface ManifestDriverResolverOptions {
  manifests: readonly ProviderManifest[];
  http: ConnectorHttpClient;
  /** The OAuth app credentials of a provider from the environment, or null when they are not set. */
  oauthCredentials: (manifest: ProviderManifest) => OAuthClientCredentials | null;
  /** Builds the driver of an API-key provider. Wired where API-key connecting is. */
  apiKeyDriver?: (manifest: ProviderManifest, http: ConnectorHttpClient) => ConnectorDriver;
}

/**
 * Builds the driver of a provider from its manifest. A "coming soon" provider,
 * a provider without credentials and a provider whose auth type has no driver
 * yet all fail with the same typed error, so no caller ever talks to a
 * half-configured provider.
 */
export class ManifestDriverResolver implements ConnectorDriverResolver {
  private readonly cache = new Map<string, ConnectorDriver>();

  constructor(private readonly options: ManifestDriverResolverOptions) {}

  driverFor(providerId: string): ConnectorDriver {
    const cached = this.cache.get(providerId);
    if (cached) return cached;
    const manifest = this.options.manifests.find((candidate) => candidate.provider_id === providerId);
    if (!manifest || manifest.status === 'coming_soon') {
      throw new ProviderUnavailableError(providerId, 'coming_soon');
    }
    let driver: ConnectorDriver;
    if (manifest.auth_type === 'oauth2_pkce') {
      const credentials = this.options.oauthCredentials(manifest);
      if (!credentials) throw new ProviderUnavailableError(providerId, 'credentials_not_configured');
      driver = new GenericOAuth2Driver(manifest, this.options.http, credentials);
    } else if (manifest.auth_type === 'api_key' && this.options.apiKeyDriver) {
      driver = this.options.apiKeyDriver(manifest, this.options.http);
    } else {
      throw new ProviderUnavailableError(providerId, 'coming_soon');
    }
    this.cache.set(providerId, driver);
    return driver;
  }
}
