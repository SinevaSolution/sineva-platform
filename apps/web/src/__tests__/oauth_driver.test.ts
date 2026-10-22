import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import {
  ConnectorAuthError,
  ConnectorUnreachableError,
  ConnectorUnsupportedError,
  type ProviderManifest,
} from '@/server/domain/connections/connector';
import { GenericOAuth2Driver } from '@/server/infrastructure/connectors/generic_oauth2_driver';
import { FakeConnectionOAuthProvider } from './fakes/fake_connection_oauth_provider';

// WP-M2-14: the config-driven driver against the fake provider. Google is the
// redirect + PKCE + refresh shape; Notion is Basic auth, JSON, no PKCE, no refresh.

const manifest = (id: string) => PROVIDER_MANIFESTS.find((m) => m.provider_id === id) as ProviderManifest;
const REDIRECT = 'https://app.sineva.test/api/v1/connections/oauth/callback';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function make(id: string, overrides = {}) {
  const m = manifest(id);
  const provider = new FakeConnectionOAuthProvider(m, overrides);
  const driver = new GenericOAuth2Driver(m, provider, {
    client_id: provider.config.client_id,
    client_secret: provider.config.client_secret,
  });
  return { m, provider, driver };
}

describe('GenericOAuth2Driver: Google Calendar shape (redirect, PKCE S256, refresh)', () => {
  let ctx: ReturnType<typeof make>;
  const scopes = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/calendar.readonly'];

  beforeEach(() => {
    ctx = make('google_calendar');
  });

  it('builds an authorization URL with the exact redirect, S256 challenge, state, scopes and provider extras', () => {
    const { url } = ctx.driver.authorize({
      redirect_uri: REDIRECT,
      state: 'state-abc',
      scopes,
      client_id: 'client-id',
      code_challenge: CHALLENGE,
      nonce: 'nonce-1',
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('scope')).toBe(scopes.join(' '));
    expect(parsed.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('nonce')).toBe('nonce-1');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    // No implicit grant, ever.
    expect(parsed.searchParams.get('response_type')).not.toContain('token');
  });

  it('exchanges a code with the verifier and returns tokens, expiry and granted scopes', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const callback = new URL(ctx.provider.authorize(url));
    const tokens = await ctx.driver.exchange({ code: callback.searchParams.get('code')!, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    expect(tokens.access_token).toMatch(/^at-/);
    expect(tokens.refresh_token).toMatch(/^rt-/);
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.scopes).toEqual(scopes);
  });

  it('a wrong PKCE verifier is invalid_grant', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const code = new URL(ctx.provider.authorize(url)).searchParams.get('code')!;
    await expect(ctx.driver.exchange({ code, redirect_uri: REDIRECT, code_verifier: 'not-the-verifier' })).rejects.toMatchObject({
      name: 'ConnectorAuthError',
      code: 'invalid_grant',
    });
  });

  it('a missing verifier is refused by a provider that required PKCE', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const code = new URL(ctx.provider.authorize(url)).searchParams.get('code')!;
    await expect(ctx.driver.exchange({ code, redirect_uri: REDIRECT })).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('a code works once', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const code = new URL(ctx.provider.authorize(url)).searchParams.get('code')!;
    await ctx.driver.exchange({ code, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    await expect(ctx.driver.exchange({ code, redirect_uri: REDIRECT, code_verifier: VERIFIER })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('a different redirect URI at exchange time is refused (exact match)', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const code = new URL(ctx.provider.authorize(url)).searchParams.get('code')!;
    await expect(
      ctx.driver.exchange({ code, redirect_uri: `${REDIRECT}/x`, code_verifier: VERIFIER }),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('refreshes with a rotating provider: the old refresh token dies, a new one is returned', async () => {
    const rotating = make('google_calendar', { rotate_refresh: true });
    const { url } = rotating.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const code = new URL(rotating.provider.authorize(url)).searchParams.get('code')!;
    const first = await rotating.driver.exchange({ code, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    const second = await rotating.driver.refresh({ refresh_token: first.refresh_token! });
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(rotating.provider.refreshTokenActive(first.refresh_token!)).toBe(false);
    await expect(rotating.driver.refresh({ refresh_token: first.refresh_token! })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('classifies failures: 4xx with an error is auth, 5xx and outages are unreachable', async () => {
    ctx.provider.failNext(503);
    await expect(ctx.driver.refresh({ refresh_token: 'x' })).rejects.toMatchObject({ name: 'ConnectorUnreachableError', status: 503 });
    ctx.provider.failNext('network');
    await expect(ctx.driver.refresh({ refresh_token: 'x' })).rejects.toBeInstanceOf(ConnectorUnreachableError);
    await expect(ctx.driver.refresh({ refresh_token: 'unknown' })).rejects.toMatchObject({ code: 'invalid_grant', status: 400 });
  });

  it('a wrong client secret is invalid_client', async () => {
    const m = manifest('google_calendar');
    const provider = new FakeConnectionOAuthProvider(m);
    const driver = new GenericOAuth2Driver(m, provider, { client_id: 'client-id', client_secret: 'wrong' });
    await expect(driver.refresh({ refresh_token: 'x' })).rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('whoami reads the account from the userinfo endpoint with the bearer token', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes, client_id: 'client-id', code_challenge: CHALLENGE });
    const code = new URL(ctx.provider.authorize(url)).searchParams.get('code')!;
    const tokens = await ctx.driver.exchange({ code, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    const who = await ctx.driver.whoami({ access_token: tokens.access_token });
    expect(who).toEqual({ external_account_id: 'acct-1', account_label: 'budi@example.test' });
    await expect(ctx.driver.whoami({ access_token: 'bad' })).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('revoke asks the provider to drop the token and reports whether it did', async () => {
    expect(await ctx.driver.revoke({ token: 'rt-abc', token_type: 'refresh_token' })).toBe(true);
    expect(ctx.provider.revoked).toContain('rt-abc');
    ctx.provider.failNext('network');
    expect(await ctx.driver.revoke({ token: 'rt-abc', token_type: 'refresh_token' })).toBe(false);
  });

  it('an error never carries a token, a code or a response body', async () => {
    const error = (await ctx.driver.refresh({ refresh_token: 'rt-SECRET-VALUE-123' }).catch((e: Error) => e)) as Error;
    expect(`${error.name} ${error.message} ${JSON.stringify(error)}`).not.toContain('SECRET-VALUE');
  });
});

describe('GenericOAuth2Driver: Notion shape (Basic client auth, JSON, no PKCE, non-expiring)', () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => {
    ctx = make('notion', { access_ttl: null, report_scopes: false, issue_refresh: false, account: { id: 'ws-1', label: 'Toko Laris' } });
  });

  it('sends no PKCE and no scope parameter, and keeps the provider extras', () => {
    const { url } = ctx.driver.authorize({
      redirect_uri: REDIRECT,
      state: 's',
      scopes: ['notion.read_content', 'notion.update_content'],
      client_id: 'client-id',
      code_challenge: CHALLENGE,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('code_challenge')).toBe(false);
    expect(parsed.searchParams.has('scope')).toBe(false);
    expect(parsed.searchParams.get('owner')).toBe('user');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('exchanges with Basic client authentication and a JSON body, and reads the account from the token response', async () => {
    const { url } = ctx.driver.authorize({ redirect_uri: REDIRECT, state: 's', scopes: ['notion.read_content'], client_id: 'client-id' });
    const code = new URL(ctx.provider.authorize(url)).searchParams.get('code')!;
    const tokens = await ctx.driver.exchange({ code, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    expect(tokens.refresh_token).toBeNull();
    expect(tokens.expires_in).toBeNull();
    expect(tokens.scopes).toBeNull();
    const request = ctx.provider.requests.at(-1)!;
    expect(request.body.startsWith('{')).toBe(true);
    expect(request.body).not.toContain('client_secret');
    const who = await ctx.driver.whoami({ token_account: tokens.account });
    expect(who).toEqual({ external_account_id: 'ws-1', account_label: 'Toko Laris' });
  });

  it('refresh is unsupported for a non-expiring token', async () => {
    await expect(ctx.driver.refresh({ refresh_token: 'x' })).rejects.toBeInstanceOf(ConnectorUnsupportedError);
  });

  it('has no revoke endpoint: revoke reports false without calling out', async () => {
    const before = ctx.provider.requests.length;
    expect(await ctx.driver.revoke({ token: 'abc', token_type: 'access_token' })).toBe(false);
    expect(ctx.provider.requests.length).toBe(before);
  });
});

describe('GenericOAuth2Driver actions', () => {
  it('lists the manifest actions', () => {
    const { driver, m } = make('google_calendar');
    expect(driver.actions()).toBe(m.actions);
  });
});
