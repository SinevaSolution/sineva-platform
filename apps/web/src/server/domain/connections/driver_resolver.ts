import type { ConnectorDriver } from './connector';

/**
 * Hands out the driver of a provider, built with that provider's credentials.
 * Throws a typed error when the provider has no driver or no credentials, so a
 * use case never talks to a half-configured provider.
 */
export interface ConnectorDriverResolver {
  driverFor(providerId: string): ConnectorDriver;
}
