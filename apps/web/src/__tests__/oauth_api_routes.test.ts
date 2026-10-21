import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getOAuthInitiate } from '@/app/api/v1/auth/oauth/[provider]/route';
import { GET as getOAuthCallback } from '@/app/api/v1/auth/oauth/[provider]/callback/route';
import { GET as getMyAccounts } from '@/app/api/v1/me/accounts/route';
import { DELETE as deleteMyAccount } from '@/app/api/v1/me/accounts/[provider]/route';
import * as container from '@/server/container';
import { FakeOAuthProvider } from './fakes/fake_oauth_provider';
import { setCustomSessionResolver } from '@/server/http/with_auth';
import type { OAuthSignInUseCase } from '@/server/application/use-cases/auth/oauth_sign_in_use_case';
import type { ListUserAccountsUseCase } from '@/server/application/use-cases/auth/list_user_accounts_use_case';
import type { UnlinkAccountUseCase } from '@/server/application/use-cases/auth/unlink_account_use_case';

describe('OAuth API Routes (WP-M0-25)', () => {
  let fakeGoogleProvider: FakeOAuthProvider;
  let fakeSignInUseCase: { execute: ReturnType<typeof vi.fn> };
  let fakeListAccountsUseCase: { execute: ReturnType<typeof vi.fn> };
  let fakeUnlinkAccountUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeGoogleProvider = new FakeOAuthProvider('google', {
      email: 'oauth.tester@example.com',
      provider_account_id: 'google_sub_123',
    });

    fakeSignInUseCase = {
      execute: vi.fn().mockResolvedValue({
        userId: 'usr_test_123',
        session: {
          sessionId: 'sess_oauth_test',
          token: 'oauth-jwt-session-token',
        },
        isNewUser: false,
      }),
    };

    fakeListAccountsUseCase = {
      execute: vi.fn().mockResolvedValue([
        {
          id: 'acc_1',
          provider: 'google',
          provider_email: 'oauth.tester@example.com',
          provider_username: null,
          created_at: '2026-10-21T12:00:00.000Z',
        },
      ]),
    };

    fakeUnlinkAccountUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(container, 'getOAuthProvider').mockImplementation((provider) => {
      if (provider === 'google') return fakeGoogleProvider;
      throw new Error(`Unsupported provider: ${provider}`);
    });
    vi.spyOn(container, 'getOAuthSignInUseCase').mockReturnValue(
      fakeSignInUseCase as unknown as OAuthSignInUseCase,
    );
    vi.spyOn(container, 'getListUserAccountsUseCase').mockReturnValue(
      fakeListAccountsUseCase as unknown as ListUserAccountsUseCase,
    );
    vi.spyOn(container, 'getUnlinkAccountUseCase').mockReturnValue(
      fakeUnlinkAccountUseCase as unknown as UnlinkAccountUseCase,
    );

    setCustomSessionResolver(null);
  });

  it('GET /api/v1/auth/oauth/[provider] sets state cookie and redirects to authorization URL', async () => {
    vi.spyOn(container, 'initiateOAuthFlow').mockReturnValue({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&state=mock_state&code_challenge=mock_ch',
      signedCookieValue: 'mock_signed_state_cookie',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/auth/oauth/google?return_to=/w/hq', {
      method: 'GET',
    });

    const res = await getOAuthInitiate(req, { params: Promise.resolve({ provider: 'google' }) });

    expect(res.status).toBe(307); // NextResponse.redirect default
    const location = res.headers.get('location');
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain('state=');
    expect(location).toContain('code_challenge=');

    const stateCookie = res.cookies.get('sineva_oauth_state');
    expect(stateCookie).toBeDefined();
    expect(stateCookie?.value).toBe('mock_signed_state_cookie');
    expect(stateCookie?.httpOnly).toBe(true);
  });

  it('GET /api/v1/auth/oauth/[provider]/callback redirects to /login on error query parameter', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/auth/oauth/google/callback?error=access_denied',
      { method: 'GET' },
    );

    const res = await getOAuthCallback(req, { params: Promise.resolve({ provider: 'google' }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in?error=access_denied');
  });

  it('GET /api/v1/auth/oauth/[provider]/callback validates PKCE, exchanges code, and sets session cookie', async () => {
    vi.spyOn(container, 'handleOAuthCallback').mockResolvedValue({
      sessionToken: 'oauth-jwt-session-token',
      targetPath: '/w/dashboard',
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/auth/oauth/google/callback?code=mock_auth_code&state=mock_state',
      {
        method: 'GET',
        headers: {
          cookie: 'sineva_oauth_state=mock_cookie_val',
        },
      },
    );

    const res = await getOAuthCallback(req, { params: Promise.resolve({ provider: 'google' }) });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/w/dashboard');

    // Verify session cookie set
    const sessionCookie = res.cookies.get('sineva_session');
    expect(sessionCookie?.value).toBe('oauth-jwt-session-token');

    // Verify state cookie cleared
    const stateCookie = res.cookies.get('sineva_oauth_state');
    expect(stateCookie?.maxAge).toBe(0);
  });

  it('GET /api/v1/me/accounts returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/me/accounts', {
      method: 'GET',
      headers: {
        'x-test-unauthenticated': 'true',
      },
    });

    const res = await getMyAccounts(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/me/accounts returns linked accounts when authenticated', async () => {
    setCustomSessionResolver(async () => ({
      userId: 'usr_test_123',
      sessionId: 'sess_1',
      memberships: [],
    }));

    const req = new NextRequest('http://localhost:3000/api/v1/me/accounts', {
      method: 'GET',
    });

    const res = await getMyAccounts(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.accounts.length).toBe(1);
    expect(body.data.accounts[0].provider).toBe('google');
  });

  it('DELETE /api/v1/me/accounts/[provider] requires fresh session and calls unlink use case', async () => {
    // Authenticated with fresh session
    setCustomSessionResolver(async () => ({
      userId: 'usr_test_123',
      sessionId: 'sess_1',
      freshUntil: new Date(Date.now() + 600000), // Fresh!
      memberships: [],
    }));

    const req = new NextRequest('http://localhost:3000/api/v1/me/accounts/google', {
      method: 'DELETE',
    });

    const res = await deleteMyAccount(req, { params: Promise.resolve({ provider: 'google' }) });
    expect(res.status).toBe(200);

    expect(fakeUnlinkAccountUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr_test_123',
        provider: 'google',
      }),
    );
  });

  it('DELETE /api/v1/me/accounts/[provider] rejects with 403 when session is stale', async () => {
    // Authenticated with stale session
    setCustomSessionResolver(async () => ({
      userId: 'usr_test_123',
      sessionId: 'sess_1',
      freshUntil: new Date(Date.now() - 5000), // Stale!
      memberships: [],
    }));

    const req = new NextRequest('http://localhost:3000/api/v1/me/accounts/google', {
      method: 'DELETE',
    });

    const res = await deleteMyAccount(req, { params: Promise.resolve({ provider: 'google' }) });
    expect(res.status).toBe(403);
  });
});
