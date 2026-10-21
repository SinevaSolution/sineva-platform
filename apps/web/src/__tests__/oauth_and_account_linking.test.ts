import { describe, expect, it, beforeEach } from 'vitest';
import {
  generateOAuthState,
  verifyOAuthState,
} from '@/server/infrastructure/security/oauth_state_service';
import { OAuthSignInUseCase } from '@/server/application/use-cases/auth/oauth_sign_in_use_case';
import { LinkAccountUseCase } from '@/server/application/use-cases/auth/link_account_use_case';
import { UnlinkAccountUseCase } from '@/server/application/use-cases/auth/unlink_account_use_case';
import { ListUserAccountsUseCase } from '@/server/application/use-cases/auth/list_user_accounts_use_case';
import { FakeOAuthProvider } from './fakes/fake_oauth_provider';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { ConflictError, ForbiddenError, ValidationError } from '@/server/domain/errors/domain_error';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { AccountRepository, AccountEntity } from '@/server/domain/repositories/account_repository';
import type { OAuthAuthService } from '@/server/domain/auth/oauth_auth_service';

describe('OAuth 2.0 State & PKCE Service (WP-M0-25)', () => {
  const secret = 'super-secret-auth-key-at-least-32-chars';

  it('generates state, PKCE code challenge and signed cookie value', () => {
    const { state, codeVerifier, codeChallenge, signedCookieValue } = generateOAuthState(
      'google',
      secret,
      '/w/my-workspace',
    );

    expect(state).toBeDefined();
    expect(codeVerifier).toBeDefined();
    expect(codeChallenge).toBeDefined();
    expect(signedCookieValue).toBeDefined();

    const payload = verifyOAuthState(signedCookieValue, state, secret);
    expect(payload.state).toBe(state);
    expect(payload.codeVerifier).toBe(codeVerifier);
    expect(payload.provider).toBe('google');
    expect(payload.returnTo).toBe('/w/my-workspace');
  });

  it('rejects tampered state cookie value', () => {
    const { state, signedCookieValue } = generateOAuthState('google', secret);
    const parts = signedCookieValue.split('.');
    const tampered = `${parts[0]}.invalidSignature12345`;

    expect(() => verifyOAuthState(tampered, state, secret)).toThrow(ValidationError);
  });

  it('rejects state mismatch when callback state differs from session state', () => {
    const { signedCookieValue } = generateOAuthState('google', secret);

    expect(() => verifyOAuthState(signedCookieValue, 'different_state', secret)).toThrow(
      /mismatch/,
    );
  });

  it('rejects expired state cookie after maxAge', () => {
    const { state, signedCookieValue } = generateOAuthState('google', secret);

    // Verify with maxAgeMs = -1 (already expired)
    expect(() => verifyOAuthState(signedCookieValue, state, secret, -1)).toThrow(/expired/);
  });
});

interface MockUser {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  status: string;
}

interface MockWorkspace {
  id: string;
  slug: string;
  owner_user_id: string;
  status: string;
}

describe('OAuthSignInUseCase & Pre-Hijacking Defense (WP-M0-25, FR-AUTH-01c)', () => {
  let auditLogger: CountingAuditLogger;
  let mockUsers: Map<string, MockUser>;
  let mockWorkspaces: Map<string, MockWorkspace>;
  let fakeAccountRepo: FakeAccountRepository;
  let fakeAuthService: FakeOAuthAuthService;

  class FakeAccountRepository implements AccountRepository {
    public accounts = new Map<string, AccountEntity>();

    async findByProviderAndAccountId(providerId: string, accountId: string) {
      const key = `${providerId}:${accountId}`;
      const account = this.accounts.get(key);
      if (!account) return null;
      const user = mockUsers.get(account.user_id);
      return {
        account,
        user: { id: user?.id ?? account.user_id, status: user?.status ?? 'active' },
      };
    }

    async findByUserId(userId: string) {
      const results: AccountEntity[] = [];
      for (const acc of this.accounts.values()) {
        if (acc.user_id === userId) results.push(acc);
      }
      return results;
    }

    async create(data: {
      user_id: string;
      provider_id: string;
      account_id: string;
      provider_email?: string | null;
      provider_username?: string | null;
    }) {
      const account: AccountEntity = {
        id: `acc_${Date.now()}_${Math.random()}`,
        user_id: data.user_id,
        provider_id: data.provider_id,
        account_id: data.account_id,
        provider_email: data.provider_email ?? null,
        provider_username: data.provider_username ?? null,
        created_at: new Date().toISOString(),
      };
      this.accounts.set(`${account.provider_id}:${account.account_id}`, account);
      return account;
    }

    async delete(id: string) {
      for (const [key, acc] of this.accounts.entries()) {
        if (acc.id === id) {
          this.accounts.delete(key);
          break;
        }
      }
    }
  }

  class FakeOAuthAuthService implements OAuthAuthService {
    async createSession(userId: string) {
      void userId;
      return {
        sessionId: 'sess_oauth_test_123',
        token: 'test-oauth-session-token',
      };
    }

    async findUserByEmail(email: string) {
      for (const u of mockUsers.values()) {
        if (u.email === email) return u;
      }
      return null;
    }

    async createUserFromOAuth(data: { email: string; fullName: string }) {
      const user = {
        id: `usr_${Date.now()}`,
        email: data.email,
        email_verified: true,
        full_name: data.fullName,
        status: 'active',
      };
      mockUsers.set(user.id, user);
      return user;
    }

    async provisionWorkspace(userId: string, fullName: string) {
      void fullName;
      const ws = {
        id: `ws_${Date.now()}`,
        slug: 'my-workspace',
        owner_user_id: userId,
        status: 'active',
      };
      mockWorkspaces.set(ws.id, ws);
      return ws;
    }
  }

  beforeEach(() => {
    auditLogger = new CountingAuditLogger();
    mockUsers = new Map();
    mockWorkspaces = new Map();
    fakeAccountRepo = new FakeAccountRepository();
    fakeAuthService = new FakeOAuthAuthService();
  });

  it('proactively stops pre-hijacking: refuses to link OAuth to an unverified email account (FR-AUTH-01c)', async () => {
    // 1. Attacker signs up with password for victim@example.com (unverified)
    const victimEmail = 'victim@example.com';
    mockUsers.set('usr_victim_unverified', {
      id: 'usr_victim_unverified',
      email: victimEmail,
      email_verified: false, // Unverified!
      full_name: 'Victim Name',
      status: 'active',
    });

    const useCase = new OAuthSignInUseCase(fakeAccountRepo, fakeAuthService, auditLogger);

    // 2. Victim logs in via Google with same email
    const googleProvider = new FakeOAuthProvider('google', {
      email: victimEmail,
      email_verified: true,
      provider_account_id: 'google_sub_victim_123',
    });

    const profile = await googleProvider.exchangeCode({
      code: 'valid-code',
      codeVerifier: 'verifier',
      redirectUri: 'http://localhost:3000/callback',
    });

    // 3. Must refuse silent linking to protect against pre-hijacking!
    await expect(useCase.execute({ profile })).rejects.toThrow(ConflictError);

    // Verify account was NOT linked
    expect(fakeAccountRepo.accounts.size).toBe(0);
  });

  it('safely links OAuth account when existing user is already email-verified (FR-AUTH-01c)', async () => {
    const verifiedEmail = 'verified.user@example.com';
    mockUsers.set('usr_verified_123', {
      id: 'usr_verified_123',
      email: verifiedEmail,
      email_verified: true, // Already verified!
      full_name: 'Verified User',
      status: 'active',
    });

    const useCase = new OAuthSignInUseCase(fakeAccountRepo, fakeAuthService, auditLogger);

    const googleProvider = new FakeOAuthProvider('google', {
      email: verifiedEmail,
      email_verified: true,
      provider_account_id: 'google_sub_verified_999',
    });

    const profile = await googleProvider.exchangeCode({
      code: 'valid-code',
      codeVerifier: 'verifier',
      redirectUri: 'http://localhost:3000/callback',
    });

    const result = await useCase.execute({ profile });

    expect(result.userId).toBe('usr_verified_123');
    expect(result.isLinked).toBe(true);
    expect(result.isNewUser).toBe(false);

    // Stored account must NOT contain provider tokens (FR-AUTH-01d)
    const storedAcc = fakeAccountRepo.accounts.get('google:google_sub_verified_999');
    expect(storedAcc).toBeDefined();
    expect(storedAcc?.user_id).toBe('usr_verified_123');
  });

  it('provisions user, account, and provisional workspace on first OAuth sign-up', async () => {
    const useCase = new OAuthSignInUseCase(fakeAccountRepo, fakeAuthService, auditLogger);

    const githubProvider = new FakeOAuthProvider('github', {
      email: 'new.developer@example.com',
      email_verified: true,
      provider_account_id: '12345678', // numeric ID per task 3
      full_name: 'New Dev',
      username: 'newdev',
    });

    const profile = await githubProvider.exchangeCode({
      code: 'valid-code',
      codeVerifier: 'verifier',
      redirectUri: 'http://localhost:3000/callback',
    });

    const result = await useCase.execute({ profile });

    expect(result.isNewUser).toBe(true);
    expect(mockUsers.size).toBe(1);

    const createdUser = Array.from(mockUsers.values())[0];
    expect(createdUser.email).toBe('new.developer@example.com');
    expect(createdUser.email_verified).toBe(true);
    expect(createdUser.full_name).toBe('New Dev');

    // Stored account
    const storedAcc = fakeAccountRepo.accounts.get('github:12345678');
    expect(storedAcc).toBeDefined();
    expect(storedAcc?.provider_username).toBe('newdev');

    // Provisional workspace created
    expect(mockWorkspaces.size).toBe(1);

    // Audit logs emitted
    const events = auditLogger.getEvents().map((e) => e.action);
    expect(events).toContain('user.signed_up');
    expect(events).toContain('user.oauth_linked');
    expect(events).toContain('workspace.created');
    expect(events).toContain('user.signed_in');
  });

  it('rejects GitHub sign-in when account has no primary verified email (FR-AUTH-01b copy)', async () => {
    const githubProvider = new FakeOAuthProvider('github', {
      email_verified: false,
    });

    await expect(
      githubProvider.exchangeCode({
        code: 'code-no-verified-email',
        codeVerifier: 'v',
        redirectUri: 'uri',
      }),
    ).rejects.toThrow(
      'Your GitHub account does not have a verified primary email address. Please verify your email on GitHub or use another sign-in method.',
    );
  });
});

describe('Account Linking & Unlinking Use Cases (WP-M0-25)', () => {
  let auditLogger: CountingAuditLogger;
  let mockAccounts: Map<string, AccountEntity>;
  let fakeAccountRepo: AccountRepository;

  const freshContext: RequestContext = {
    user_id: 'usr_alpha',
    session_id: 'sess_1',
    request_id: 'req_1',
    fresh_until: new Date(Date.now() + 600000), // Fresh!
  };

  const staleContext: RequestContext = {
    user_id: 'usr_alpha',
    session_id: 'sess_1',
    request_id: 'req_1',
    fresh_until: new Date(Date.now() - 1000), // Stale!
  };

  beforeEach(() => {
    auditLogger = new CountingAuditLogger();
    mockAccounts = new Map();

    fakeAccountRepo = {
      findByProviderAndAccountId: async (providerId: string, accountId: string) => {
        const key = `${providerId}:${accountId}`;
        const acc = mockAccounts.get(key);
        if (!acc) return null;
        return { account: acc, user: { id: acc.user_id, status: 'active' } };
      },
      findByUserId: async (userId: string) => {
        const list: AccountEntity[] = [];
        for (const a of mockAccounts.values()) {
          if (a.user_id === userId) list.push(a);
        }
        return list;
      },
      create: async (data) => {
        const acc: AccountEntity = {
          id: `acc_${Date.now()}`,
          user_id: data.user_id,
          provider_id: data.provider_id,
          account_id: data.account_id,
          provider_email: data.provider_email ?? null,
          provider_username: data.provider_username ?? null,
          created_at: new Date().toISOString(),
        };
        mockAccounts.set(`${acc.provider_id}:${acc.account_id}`, acc);
        return acc;
      },
      delete: async (id: string) => {
        for (const [k, a] of mockAccounts.entries()) {
          if (a.id === id) {
            mockAccounts.delete(k);
            break;
          }
        }
      },
    };
  });

  it('LinkAccountUseCase requires fresh session', async () => {
    const useCase = new LinkAccountUseCase(fakeAccountRepo, auditLogger);

    const profile = {
      provider: 'github' as const,
      provider_account_id: '8888',
      email: 'alpha@example.com',
      email_verified: true,
    };

    await expect(
      useCase.execute({
        userId: 'usr_alpha',
        profile,
        requestContext: staleContext,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('LinkAccountUseCase links provider with fresh session and emits user.oauth_linked', async () => {
    const useCase = new LinkAccountUseCase(fakeAccountRepo, auditLogger);

    const profile = {
      provider: 'github' as const,
      provider_account_id: '8888',
      email: 'alpha@example.com',
      email_verified: true,
    };

    await useCase.execute({
      userId: 'usr_alpha',
      profile,
      requestContext: freshContext,
    });

    expect(mockAccounts.size).toBe(1);
    const events = auditLogger.getEvents().map((e) => e.action);
    expect(events).toContain('user.oauth_linked');
  });

  it('UnlinkAccountUseCase requires fresh session', async () => {
    const useCase = new UnlinkAccountUseCase(fakeAccountRepo, auditLogger);

    await expect(
      useCase.execute({
        userId: 'usr_alpha',
        provider: 'google',
        requestContext: staleContext,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('UnlinkAccountUseCase refuses to remove the last sign-in method (server-enforced, FR-AUTH-01c)', async () => {
    // Only 1 account exists
    mockAccounts.set('google:sub_123', {
      id: 'acc_1',
      user_id: 'usr_alpha',
      provider_id: 'google',
      account_id: 'sub_123',
      created_at: new Date().toISOString(),
    });

    const useCase = new UnlinkAccountUseCase(fakeAccountRepo, auditLogger);

    await expect(
      useCase.execute({
        userId: 'usr_alpha',
        provider: 'google',
        requestContext: freshContext,
      }),
    ).rejects.toThrow(ValidationError);

    // Account still exists
    expect(mockAccounts.size).toBe(1);
  });

  it('UnlinkAccountUseCase allows unlinking when another sign-in method remains and emits user.oauth_unlinked', async () => {
    // 2 accounts exist: password credential and Google
    mockAccounts.set('credential:usr_alpha', {
      id: 'acc_cred',
      user_id: 'usr_alpha',
      provider_id: 'credential',
      account_id: 'usr_alpha',
      created_at: new Date().toISOString(),
    });
    mockAccounts.set('google:sub_123', {
      id: 'acc_google',
      user_id: 'usr_alpha',
      provider_id: 'google',
      account_id: 'sub_123',
      created_at: new Date().toISOString(),
    });

    const useCase = new UnlinkAccountUseCase(fakeAccountRepo, auditLogger);

    await useCase.execute({
      userId: 'usr_alpha',
      provider: 'google',
      requestContext: freshContext,
    });

    expect(mockAccounts.size).toBe(1);
    expect(mockAccounts.has('credential:usr_alpha')).toBe(true);
    expect(mockAccounts.has('google:sub_123')).toBe(false);

    const events = auditLogger.getEvents().map((e) => e.action);
    expect(events).toContain('user.oauth_unlinked');
  });

  it('ListUserAccountsUseCase returns sanitized account details without sensitive fields', async () => {
    mockAccounts.set('google:sub_123', {
      id: 'acc_google',
      user_id: 'usr_alpha',
      provider_id: 'google',
      account_id: 'sub_123',
      provider_email: 'alpha@gmail.com',
      provider_username: null,
      created_at: '2026-10-21T10:00:00.000Z',
    });

    const useCase = new ListUserAccountsUseCase(fakeAccountRepo);
    const list = await useCase.execute('usr_alpha');

    expect(list.length).toBe(1);
    expect(list[0].provider).toBe('google');
    expect(list[0].provider_email).toBe('alpha@gmail.com');
    expect(list[0].created_at).toBe('2026-10-21T10:00:00.000Z');
  });
});
