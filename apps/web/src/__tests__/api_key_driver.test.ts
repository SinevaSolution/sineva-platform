import { describe, expect, it } from 'vitest';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import {
  ConnectorAuthError,
  ConnectorUnreachableError,
  ConnectorUnsupportedError,
  type ConnectorHttpClient,
  type ConnectorHttpRequest,
  type ProviderManifest,
} from '@/server/domain/connections/connector';
import { keyHint } from '@/server/domain/connections/key_hint';
import { ApiKeyDriver } from '@/server/infrastructure/connectors/api_key_driver';

const manifest = (id: string) => PROVIDER_MANIFESTS.find((m) => m.provider_id === id) as ProviderManifest;

function http(respond: (request: ConnectorHttpRequest) => { status: number } | Error) {
  const requests: ConnectorHttpRequest[] = [];
  const client: ConnectorHttpClient = {
    async request(request) {
      requests.push(request);
      const result = respond(request);
      if (result instanceof Error) throw result;
      return { status: result.status, body: '' };
    },
  };
  return { client, requests };
}

describe('keyHint', () => {
  it('shows a short prefix and the last four, never the middle', () => {
    expect(keyHint('xnd_development_abcdefghijklmnopqrstuvwxyz1234')).toBe('xnd_…1234');
    expect(keyHint('xnd_development_abcdefghijklmnopqrstuvwxyz1234')).not.toContain('abcdefgh');
  });
  it('a short secret shows only its last four', () => {
    expect(keyHint('secret99')).toBe('…et99');
    expect(keyHint('  trimmed-secret-value-0000 ')).toBe('trim…0000');
  });
});

describe('ApiKeyDriver (the connection test, FR-CONN-29)', () => {
  it('Xendit: tests the key with HTTP Basic (key as user, empty password) on the balance endpoint', async () => {
    const { client, requests } = http(() => ({ status: 200 }));
    const driver = new ApiKeyDriver(manifest('xendit'), client);
    const identity = await driver.whoami({ credentials: { secret_key: 'xnd_development_abcdefghijklmnop1234' } });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider_id: 'xendit', method: 'GET', url: 'https://api.xendit.co/balance' });
    expect(requests[0]!.headers!.Authorization).toBe(`Basic ${Buffer.from('xnd_development_abcdefghijklmnop1234:').toString('base64')}`);
    expect(identity).toEqual({ external_account_id: null, account_label: 'xnd_…1234' });
  });

  it('Midtrans: picks the sandbox or production host from the environment field, and counts a 404 as an accepted key', async () => {
    const sandbox = http(() => ({ status: 404 }));
    const driver = new ApiKeyDriver(manifest('midtrans'), sandbox.client);
    const identity = await driver.whoami({ credentials: { server_key: 'SB-Mid-server-abcdefghij1234', environment: 'sandbox' } });
    expect(sandbox.requests[0]!.url).toBe('https://api.sandbox.midtrans.com/v2/sineva-connection-check/status');
    expect(identity.account_label).toBe('SB-M…1234 (sandbox)');

    const live = http(() => ({ status: 404 }));
    await new ApiKeyDriver(manifest('midtrans'), live.client).whoami({
      credentials: { server_key: 'Mid-server-abcdefghij1234', environment: 'production' },
    });
    expect(live.requests[0]!.url).toBe('https://api.midtrans.com/v2/sineva-connection-check/status');
  });

  it('a 401 is invalid credentials, a 403 is a key without permission', async () => {
    const creds = { secret_key: 'xnd_development_abcdefghijklmnop1234' };
    await expect(new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 401 })).client).whoami({ credentials: creds })).rejects.toMatchObject({
      name: 'ConnectorAuthError',
      code: 'invalid_client',
      status: 401,
    });
    await expect(new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 403 })).client).whoami({ credentials: creds })).rejects.toMatchObject({
      code: 'access_denied',
      status: 403,
    });
  });

  it('5xx, 429 and outages are unreachable; any other status is an unknown refusal', async () => {
    const creds = { secret_key: 'xnd_development_abcdefghijklmnop1234' };
    await expect(new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 503 })).client).whoami({ credentials: creds })).rejects.toBeInstanceOf(
      ConnectorUnreachableError,
    );
    await expect(new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 429 })).client).whoami({ credentials: creds })).rejects.toBeInstanceOf(
      ConnectorUnreachableError,
    );
    await expect(
      new ApiKeyDriver(manifest('xendit'), http(() => new ConnectorUnreachableError(null)).client).whoami({ credentials: creds }),
    ).rejects.toBeInstanceOf(ConnectorUnreachableError);
    await expect(new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 418 })).client).whoami({ credentials: creds })).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('an error never quotes the key', async () => {
    const key = 'xnd_development_SECRETSECRETSECRET1234';
    const error = (await new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 401 })).client)
      .whoami({ credentials: { secret_key: key } })
      .catch((e: Error) => e)) as Error;
    expect(`${error.name} ${error.message} ${JSON.stringify(error)}`).not.toContain('SECRETSECRET');
  });

  it('a missing key or an unknown environment is refused before any request', async () => {
    const { client, requests } = http(() => ({ status: 200 }));
    await expect(new ApiKeyDriver(manifest('xendit'), client).whoami({ credentials: {} })).rejects.toBeInstanceOf(ConnectorAuthError);
    await expect(
      new ApiKeyDriver(manifest('midtrans'), client).whoami({ credentials: { server_key: 'k'.repeat(20), environment: 'staging' } }),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
    expect(requests).toHaveLength(0);
  });

  it('has no sign-in flow, no refresh and nothing to revoke at the provider', async () => {
    const driver = new ApiKeyDriver(manifest('xendit'), http(() => ({ status: 200 })).client);
    expect(() => driver.authorize({ redirect_uri: 'x', state: 's', scopes: [], client_id: 'c' })).toThrow(ConnectorUnsupportedError);
    await expect(driver.exchange()).rejects.toBeInstanceOf(ConnectorUnsupportedError);
    await expect(driver.refresh()).rejects.toBeInstanceOf(ConnectorUnsupportedError);
    expect(await driver.revoke()).toBe(false);
    expect(driver.actions()).toBe(manifest('xendit').actions);
  });
});
