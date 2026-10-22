import crypto from 'node:crypto';
import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getOAuthInitiate } from '@/app/api/v1/auth/oauth/[provider]/route';
import { GET as getOAuthCallback } from '@/app/api/v1/auth/oauth/[provider]/callback/route';
import { DELETE as deleteMyAccount } from '@/app/api/v1/me/accounts/[provider]/route';
import * as container from '@/server/container';
import { setCustomSessionResolver } from '@/server/http/with_auth';
import { requireFreshSession } from '@/server/domain/auth/fresh_session';
import {
  ConflictError,
  ForbiddenError,
  FreshSessionRequiredError,
} from '@/server/domain/errors/domain_error';
import {
  generateOAuthState,
  verifyOAuthState,
} from '@/server/infrastructure/security/oauth_state_service';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import * as envModule from '@/server/infrastructure/config/env';
import { validateEnvConfig } from '@/server/infrastructure/config/env';
import { sanitizeNextRedirect } from '@/server/domain/auth/safe_redirect';
import { LinkAccountUseCase } from '@/server/application/use-cases/auth/link_account_use_case';
import { OAuthReauthenticateUseCase } from '@/server/application/use-cases/auth/oauth_reauthenticate_use_case';
import { OAuthIntentCallbackUseCase } from '@/server/application/use-cases/auth/oauth_intent_callback_use_case';
import type { OAuthProfile } from '@/server/domain/auth/oauth_provider';
import type { AccountEntity, AccountRepository } from '@/server/domain/repositories/account_repository';
import type { RequestContext } from '@/server/domain/context/request_context';

installHeaderSessionResolver();

const SECRET = 'super-secret-auth-key-at-least-32-chars';

function profile(overrides: Partial<OAuthProfile> = {}): OAuthProfile {
  return {
    provider: 'google',
    provider_account_id: 'g-1',
    email: 'owner@example.com',
    email_verified: true,
    full_name: 'Owner',
    avatar_url: null,
    username: null,
    ...overrides,
  };
}

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    user_id: 'usr-1',
    session_id: 'sess-1',
    request_id: 'req-1',
    fresh_until: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

class FakeAccounts implements AccountRepository {
  rows: AccountEntity[] = [];
  async findByProviderAndAccountId(providerId: string, accountId: string) {
    const account = this.rows.find((r) => r.provider_id === providerId && r.account_id === accountId);
    return account ? { account, user: { id: account.user_id, status: 'active' } } : null;
  }
  async findByUserId(userId: string) {
    return this.rows.filter((r) => r.user_id === userId);
  }
  async create(data: {
    user_id: string;
    provider_id: string;
    account_id: string;
    provider_email?: string | null;
    provider_username?: string | null;
  }) {
    const row: AccountEntity = {
      id: `acc-${this.rows.length + 1}`,
      created_at: '2026-10-22T00:00:00Z',
      ...data,
    };
    this.rows.push(row);
    return row;
  }
  async delete(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

describe('fresh-session error', () => {
  it('carries a machine code the client can tell apart from a plain 403', () => {
    expect.assertions(3);
    try {
      requireFreshSession(context({ fresh_until: new Date(Date.now() - 1000) }));
    } catch (error) {
      expect(error).toBeInstanceOf(FreshSessionRequiredError);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as FreshSessionRequiredError).details[0]?.code).toBe('fresh_session_required');
    }
  });

  it('is what the route guard answers for a stale session', async () => {
    setCustomSessionResolver(async () => ({
      userId: 'usr-1',
      sessionId: 'sess-1',
      freshUntil: new Date(Date.now() - 5000),
      memberships: [],
    }));
    const res = await deleteMyAccount(
      new NextRequest('http://localhost:3000/api/v1/me/accounts/google', { method: 'DELETE' }),
      { params: Promise.resolve({ provider: 'google' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).errors[0].code).toBe('fresh_session_required');
  });
});

describe('OAuth state binds intent and user', () => {
  it('round-trips intent and the signed-in user', () => {
    const { state, signedCookieValue } = generateOAuthState('google', SECRET, '/w/acme', {
      intent: 'reauth',
      userId: 'usr-1',
    });
    const payload = verifyOAuthState(signedCookieValue, state, SECRET);
    expect(payload.intent).toBe('reauth');
    expect(payload.userId).toBe('usr-1');
  });

  it('defaults to a plain sign-in with no user', () => {
    const { state, signedCookieValue } = generateOAuthState('github', SECRET);
    const payload = verifyOAuthState(signedCookieValue, state, SECRET);
    expect(payload.intent).toBe('sign_in');
    expect(payload.userId).toBeUndefined();
  });

  it('treats a cookie issued before intents existed as a sign-in', () => {
    const legacy = { state: 's', codeVerifier: 'v', provider: 'google', createdAt: Date.now() };
    const b64 = Buffer.from(JSON.stringify(legacy)).toString('base64url');
    // Same signing as the service: HMAC-SHA256 over the base64url payload.
    const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
    expect(verifyOAuthState(`${b64}.${sig}`, 's', SECRET).intent).toBe('sign_in');
  });
});

describe('OAuthReauthenticateUseCase', () => {
  let accounts: FakeAccounts;
  let audit: CountingAuditLogger;
  const markFresh = vi.fn();

  beforeEach(() => {
    accounts = new FakeAccounts();
    audit = new CountingAuditLogger();
    markFresh.mockReset().mockResolvedValue({
      refreshed_token: 'fresh.token',
      fresh_until: new Date('2026-10-22T10:15:00Z'),
    });
  });

  it('marks the current session fresh when the provider account belongs to the signed-in user', async () => {
    await accounts.create({ user_id: 'usr-1', provider_id: 'google', account_id: 'g-1' });
    const result = await new OAuthReauthenticateUseCase(accounts, { markFresh }, audit).execute({
      profile: profile(),
      requestContext: context(),
    });
    expect(markFresh).toHaveBeenCalledWith('usr-1', 'sess-1');
    expect(result.refreshed_token).toBe('fresh.token');
    expect(audit.getEvents().map((e) => e.action)).toEqual(['user.reauthenticated']);
    expect(JSON.stringify(audit.getEvents())).not.toContain('owner@example.com');
  });

  it('refuses a provider account that belongs to someone else', async () => {
    await accounts.create({ user_id: 'usr-2', provider_id: 'google', account_id: 'g-1' });
    await expect(
      new OAuthReauthenticateUseCase(accounts, { markFresh }, audit).execute({
        profile: profile(),
        requestContext: context(),
      }),
    ).rejects.toMatchObject({ status: 403, details: [{ code: 'oauth_account_mismatch' }] });
    expect(markFresh).not.toHaveBeenCalled();
  });

  it('refuses a provider account that is not linked at all', async () => {
    await expect(
      new OAuthReauthenticateUseCase(accounts, { markFresh }, audit).execute({
        profile: profile(),
        requestContext: context(),
      }),
    ).rejects.toMatchObject({ status: 403, details: [{ code: 'oauth_account_mismatch' }] });
    expect(markFresh).not.toHaveBeenCalled();
  });
});

describe('LinkAccountUseCase guards', () => {
  it('refuses a second account of a provider the user already linked', async () => {
    const accounts = new FakeAccounts();
    await accounts.create({ user_id: 'usr-1', provider_id: 'google', account_id: 'g-1' });
    const useCase = new LinkAccountUseCase(accounts, new CountingAuditLogger());
    await expect(
      useCase.execute({
        userId: 'usr-1',
        profile: profile({ provider_account_id: 'g-2' }),
        requestContext: context(),
      }),
    ).rejects.toMatchObject({ status: 409, details: [{ code: 'provider_already_linked' }] });
    expect(accounts.rows).toHaveLength(1);
  });

  it('names the account-in-use case with its own code', async () => {
    const accounts = new FakeAccounts();
    await accounts.create({ user_id: 'usr-2', provider_id: 'google', account_id: 'g-1' });
    const useCase = new LinkAccountUseCase(accounts, new CountingAuditLogger());
    const attempt = useCase.execute({
      userId: 'usr-1',
      profile: profile(),
      requestContext: context(),
    });
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toMatchObject({ details: [{ code: 'account_in_use' }] });
  });
});

describe('OAuthIntentCallbackUseCase', () => {
  let accounts: FakeAccounts;
  let audit: CountingAuditLogger;
  let useCase: OAuthIntentCallbackUseCase;
  const markFresh = vi.fn();
  const session = { userId: 'usr-1', sessionId: 'sess-1', freshUntil: new Date(Date.now() + 60_000) };
  const returnTo = '/w/acme/settings/profile?tab=sign_in';

  beforeEach(() => {
    accounts = new FakeAccounts();
    audit = new CountingAuditLogger();
    markFresh.mockReset().mockResolvedValue({
      refreshed_token: 'fresh.token',
      fresh_until: new Date(Date.now() + 900_000),
    });
    useCase = new OAuthIntentCallbackUseCase(
      new LinkAccountUseCase(accounts, audit),
      new OAuthReauthenticateUseCase(accounts, { markFresh }, audit),
    );
  });

  it('links to the signed-in user and keeps the current session', async () => {
    const result = await useCase.execute({
      intent: 'link',
      boundUserId: 'usr-1',
      session,
      profile: profile(),
      returnTo,
      requestId: 'req-1',
    });
    expect(accounts.rows.map((r) => [r.user_id, r.provider_id])).toEqual([['usr-1', 'google']]);
    expect(result.sessionToken).toBeUndefined();
    expect(result.targetPath).toBe('/w/acme/settings/profile?tab=sign_in&oauth=linked');
  });

  it('refuses to link when the browser session is not the one that started the flow', async () => {
    const result = await useCase.execute({
      intent: 'link',
      boundUserId: 'usr-9',
      session,
      profile: profile(),
      returnTo,
      requestId: 'req-1',
    });
    expect(accounts.rows).toHaveLength(0);
    expect(result.targetPath).toBe('/w/acme/settings/profile?tab=sign_in&oauth=mismatch');
  });

  it('refuses to link without a session', async () => {
    const result = await useCase.execute({
      intent: 'link',
      boundUserId: 'usr-1',
      session: null,
      profile: profile(),
      returnTo,
      requestId: 'req-1',
    });
    expect(accounts.rows).toHaveLength(0);
    expect(result.targetPath).toContain('oauth=mismatch');
  });

  it('reports a provider account that belongs to another user', async () => {
    await accounts.create({ user_id: 'usr-2', provider_id: 'google', account_id: 'g-1' });
    const result = await useCase.execute({
      intent: 'link',
      boundUserId: 'usr-1',
      session,
      profile: profile(),
      returnTo,
      requestId: 'req-1',
    });
    expect(result.targetPath).toContain('oauth=account_in_use');
    expect(accounts.rows).toHaveLength(1);
  });

  it('reports a stale session instead of failing the page', async () => {
    const result = await useCase.execute({
      intent: 'link',
      boundUserId: 'usr-1',
      session: { ...session, freshUntil: new Date(Date.now() - 1000) },
      profile: profile(),
      returnTo,
      requestId: 'req-1',
    });
    expect(result.targetPath).toContain('oauth=fresh_required');
  });

  it('returns the refreshed session token after a successful re-auth', async () => {
    await accounts.create({ user_id: 'usr-1', provider_id: 'google', account_id: 'g-1' });
    const result = await useCase.execute({
      intent: 'reauth',
      boundUserId: 'usr-1',
      session,
      profile: profile(),
      returnTo: '/w/acme/settings/members',
      requestId: 'req-1',
    });
    expect(result.sessionToken).toBe('fresh.token');
    expect(result.targetPath).toBe('/w/acme/settings/members?oauth=reauthenticated');
  });

  it('reports a re-auth with the wrong provider account and does not touch the session', async () => {
    await accounts.create({ user_id: 'usr-2', provider_id: 'google', account_id: 'g-1' });
    const result = await useCase.execute({
      intent: 'reauth',
      boundUserId: 'usr-1',
      session,
      profile: profile(),
      returnTo: '/w/acme/settings/members',
      requestId: 'req-1',
    });
    expect(result.sessionToken).toBeUndefined();
    expect(result.targetPath).toBe('/w/acme/settings/members?oauth=mismatch');
    expect(markFresh).not.toHaveBeenCalled();
  });

  it('never leaves the app origin', async () => {
    const result = await useCase.execute({
      intent: 'link',
      boundUserId: 'usr-1',
      session,
      profile: profile(),
      returnTo: 'https://evil.example/x',
      requestId: 'req-1',
    });
    expect(result.targetPath.startsWith('/')).toBe(true);
    expect(result.targetPath.startsWith('//')).toBe(false);
  });
});

describe('OAuth routes with intents', () => {
  const initiate = (path: string, headers: Record<string, string> = {}) =>
    getOAuthInitiate(new NextRequest(`http://localhost:3000${path}`, { headers }), {
      params: Promise.resolve({ provider: 'google' }),
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    installHeaderSessionResolver();
    vi.spyOn(container, 'isOAuthProviderConfigured').mockReturnValue(true);
  });

  it('sends a signed-out visitor who asks to link or re-confirm to sign in first', async () => {
    const res = await initiate('/api/v1/auth/oauth/google?intent=link&return_to=/w/acme', {
      'x-test-unauthenticated': 'true',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in');
  });

  it('binds the flow to the signed-in user', async () => {
    const spy = vi.spyOn(container, 'initiateOAuthFlow').mockReturnValue({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s',
      signedCookieValue: 'cookie',
    });
    const res = await initiate(
      '/api/v1/auth/oauth/google?intent=reauth&return_to=/w/acme/settings/members',
      { 'x-test-session-user-id': 'usr-1' },
    );
    expect(res.status).toBe(307);
    expect(spy).toHaveBeenCalledWith('google', {
      returnTo: '/w/acme/settings/members',
      intent: 'reauth',
      userId: 'usr-1',
    });
  });

  it('comes back with a clear code when the provider is not configured', async () => {
    vi.spyOn(container, 'isOAuthProviderConfigured').mockReturnValue(false);
    const res = await initiate(
      '/api/v1/auth/oauth/google?intent=link&return_to=%2Fw%2Facme%2Fsettings%2Fprofile%3Ftab%3Dsign_in',
      { 'x-test-session-user-id': 'usr-1' },
    );
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/w/acme/settings/profile');
    expect(location.searchParams.get('oauth')).toBe('not_configured');
  });

  it('rejects an unknown intent', async () => {
    const res = await initiate('/api/v1/auth/oauth/google?intent=takeover', {
      'x-test-session-user-id': 'usr-1',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in?error=');
  });

  it('callback after a link keeps the existing session cookie untouched', async () => {
    vi.spyOn(container, 'handleOAuthCallback').mockResolvedValue({
      targetPath: '/w/acme/settings/profile?tab=sign_in&oauth=linked',
    });
    const res = await getOAuthCallback(
      new NextRequest('http://localhost:3000/api/v1/auth/oauth/google/callback?code=c&state=s', {
        headers: { cookie: 'sineva_oauth_state=x', 'x-test-session-user-id': 'usr-1' },
      }),
      { params: Promise.resolve({ provider: 'google' }) },
    );
    expect(res.headers.get('location')).toContain('oauth=linked');
    expect(res.cookies.get('sineva_session')).toBeUndefined();
    expect(res.cookies.get('sineva_oauth_state')?.maxAge).toBe(0);
  });

  it('callback passes the browser session so the use case can check the binding', async () => {
    const spy = vi.spyOn(container, 'handleOAuthCallback').mockResolvedValue({
      sessionToken: 'fresh.token',
      targetPath: '/w/acme/settings/members?oauth=reauthenticated',
    });
    const res = await getOAuthCallback(
      new NextRequest('http://localhost:3000/api/v1/auth/oauth/google/callback?code=c&state=s', {
        headers: { cookie: 'sineva_oauth_state=x', 'x-test-session-user-id': 'usr-1' },
      }),
      { params: Promise.resolve({ provider: 'google' }) },
    );
    expect(spy.mock.calls[0]?.[0].session).toMatchObject({ userId: 'usr-1' });
    expect(res.cookies.get('sineva_session')?.value).toBe('fresh.token');
  });

  it('a provider error during link goes back to the settings page, not the sign-in page', async () => {
    vi.spyOn(container, 'describeOAuthFailureTarget').mockReturnValue(
      '/w/acme/settings/profile?tab=sign_in&oauth=cancelled',
    );
    const res = await getOAuthCallback(
      new NextRequest(
        'http://localhost:3000/api/v1/auth/oauth/google/callback?error=access_denied&state=s',
        { headers: { cookie: 'sineva_oauth_state=x' } },
      ),
      { params: Promise.resolve({ provider: 'google' }) },
    );
    expect(res.headers.get('location')).toContain('oauth=cancelled');
  });
});

describe('test identity provider override', () => {
  const prod = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://app.sineva.id',
    DATABASE_URL: 'postgresql://prod_user:p7_xK9_SecureRealProdPw@postgres.prod:5432/sineva_platform',
    REDIS_URL: 'redis://redis.prod:6379/0',
    S3_ENDPOINT: 'https://s3.internal.sineva.com',
    S3_PUBLIC_ENDPOINT: 'https://s3.sineva.com',
    S3_ACCESS_KEY_ID: 'AKIA_PROD_S3_KEY_REAL',
    S3_SECRET_ACCESS_KEY: 's3_prod_secret_key_long_and_complex_12345',
    AI_ENGINE_INTERNAL_URL: 'http://sineva-ai:8000',
    AI_ENGINE_INTERNAL_API_KEY: 'snv_ai_prod_key_77a98c11bf882d9e',
    AUTH_SECRET: 'auth_secret_must_be_at_least_32_characters_long_real',
    INTERNAL_CONTEXT_SIGNING_KEY: 'prod-signing-key-material-0123456789abcdef',
    INTERNAL_CONTEXT_KID: 'k1',
  };

  it('is off by default', () => {
    expect(validateEnvConfig(prod).oauth_test_idp_url).toBeUndefined();
  });

  it('refuses to run in production without the second explicit flag', () => {
    expect(() =>
      validateEnvConfig({ ...prod, OAUTH_TEST_IDP_URL: 'http://127.0.0.1:4010' }),
    ).toThrow(/OAUTH_TEST_IDP_ALLOW/);
  });

  it('is accepted in production only with both flags (browser test stack)', () => {
    const cfg = validateEnvConfig({
      ...prod,
      OAUTH_TEST_IDP_URL: 'http://127.0.0.1:4010',
      OAUTH_TEST_IDP_ALLOW: 'true',
    });
    expect(cfg.oauth_test_idp_url).toBe('http://127.0.0.1:4010');
  });
});

describe('redirect sanitizer', () => {
  it.each(['/\\evil.example', '/\t/evil.example', '//evil.example', 'https://evil.example', 'javascript:alert(1)'])(
    'rejects %j',
    (value) => {
      expect(sanitizeNextRedirect(value, '/safe')).toBe('/safe');
    },
  );
  it('keeps a normal same-origin path with its query', () => {
    expect(sanitizeNextRedirect('/w/acme/settings/members?x=1', '/')).toBe('/w/acme/settings/members?x=1');
  });
});

describe('redirects stay on the configured app address', () => {
  // `next start` reports request.url with the host `localhost` even when the app
  // is opened at 127.0.0.1. A redirect built from it leaves the host the session
  // cookie was set for, so a successful provider sign-in looked signed out.
  it('sends the person back to the app URL, not to the host the request reported', async () => {
    vi.restoreAllMocks();
    installHeaderSessionResolver();
    const real = envModule.getEnvConfig();
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      ...real,
      next_public_app_url: 'http://127.0.0.1:3001',
    });
    vi.spyOn(container, 'handleOAuthCallback').mockResolvedValue({
      sessionToken: 'tok',
      targetPath: '/w/acme',
    });
    const res = await getOAuthCallback(
      new NextRequest('http://localhost:3001/api/v1/auth/oauth/google/callback?code=c&state=s', {
        headers: { cookie: 'sineva_oauth_state=x' },
      }),
      { params: Promise.resolve({ provider: 'google' }) },
    );
    expect(res.headers.get('location')).toBe('http://127.0.0.1:3001/w/acme');
  });
});
