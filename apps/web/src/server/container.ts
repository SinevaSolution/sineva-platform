import 'server-only';
import { GetAgentsUseCase } from './application/use-cases/get_agents_use_case';
import { GetSystemHealthUseCase } from './application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from './application/use-cases/presign_storage_upload_use_case';
import type { AgentRepository } from './domain/repositories/agent_repository';
import type { AiEngineGateway } from './domain/repositories/ai_engine_gateway';
import type { CacheRepository } from './domain/repositories/cache_repository';
import type { DatabaseHealthProbe } from './domain/repositories/database_health_probe';
import type { StorageRepository } from './domain/repositories/storage_repository';
import type { EmailSender } from './domain/email/email_sender';
import type { BreachedPasswordChecker } from './domain/auth/breached_password_checker';
import { FakeBreachedPasswordChecker } from './domain/auth/breached_password_checker';
import { defaultAuditLogger } from './domain/audit/audit_logger';
import { FakeEmailSender } from './infrastructure/email/fake_email_sender';
import { SmtpEmailSender } from './infrastructure/email/smtp_email_sender';
import { RedisCacheRepository } from './infrastructure/cache/redis_cache_repository';
import { getEnvConfig } from './infrastructure/config/env';
import { PrismaAgentRepository } from './infrastructure/database/prisma_agent_repository';
import { PrismaDatabaseHealthProbe } from './infrastructure/database/prisma_database_health_probe';
import { getPrismaClient } from './infrastructure/database/prisma_client';
import { InternalAiEngineGateway } from './infrastructure/gateways/internal_ai_engine_gateway';
import type { WorkspaceRepository } from './domain/repositories/workspace_repository';
import type { WorkspaceMemberRepository } from './domain/repositories/workspace_member_repository';
import { PrismaWorkspaceRepository } from './infrastructure/database/prisma_workspace_repository';
import { PrismaWorkspaceMemberRepository } from './infrastructure/database/prisma_workspace_member_repository';
import { CreateWorkspaceUseCase } from './application/use-cases/workspace/create_workspace_use_case';
import { GetWorkspaceUseCase } from './application/use-cases/workspace/get_workspace_use_case';
import { UpdateWorkspaceUseCase } from './application/use-cases/workspace/update_workspace_use_case';
import { ListUserWorkspacesUseCase } from './application/use-cases/workspace/list_user_workspaces_use_case';
import { SeaweedStorageRepository } from './infrastructure/storage/seaweed_storage_repository';
import { PwnedPasswordsBreachedChecker } from './infrastructure/security/pwned_passwords_checker';
import { JwtAuthService } from './infrastructure/auth/jwt_auth_service';
import type { SigningKeyRepository } from './domain/repositories/signing_key_repository';
import { PrismaSigningKeyRepository } from './infrastructure/database/prisma_signing_key_repository';
import type { ContextSigner } from './domain/context/signed_context';
import { createDefaultContextSigner } from './infrastructure/security/context_signer';
import type { OAuthProvider } from './domain/auth/oauth_provider';
import { GoogleOAuthProvider, GitHubOAuthProvider } from './infrastructure/auth/oauth_providers';
import { OAuthSignInUseCase } from './application/use-cases/auth/oauth_sign_in_use_case';
import { LinkAccountUseCase } from './application/use-cases/auth/link_account_use_case';
import { UnlinkAccountUseCase } from './application/use-cases/auth/unlink_account_use_case';
import { ListUserAccountsUseCase } from './application/use-cases/auth/list_user_accounts_use_case';
import type { AccountRepository } from './domain/repositories/account_repository';
import { PrismaAccountRepository } from './infrastructure/database/prisma_account_repository';
import type { OAuthAuthService } from './domain/auth/oauth_auth_service';
import { PrismaOAuthAuthService } from './infrastructure/auth/prisma_oauth_auth_service';
import { generateOAuthState, verifyOAuthState } from './infrastructure/security/oauth_state_service';
import { ValidationError } from './domain/errors/domain_error';

// Composition root: the only module that knows which concrete adapter backs
// each port. Route handlers and pages ask for use cases here instead of
// importing infrastructure, so swapping an adapter is a one-line change.
//
// Everything is built on first use rather than at import time. Adapter
// constructors read env and may open connections; doing that on import would
// make `next build` (which imports every route module to collect page data)
// touch real infrastructure, and would make env-dependent tests order-sensitive.

function memoize<T>(factory: () => T): () => T {
  let instance: T | null = null;
  return () => {
    if (instance === null) {
      instance = factory();
    }
    return instance;
  };
}

// Adapters are memoized because they hold resources that must be shared across
// requests: the Prisma client owns the Postgres connection pool, and the cache
// and storage adapters own their clients.
const getAgentRepository = memoize<AgentRepository>(
  () => new PrismaAgentRepository(getPrismaClient()),
);
const getDatabaseHealthProbe = memoize<DatabaseHealthProbe>(
  () => new PrismaDatabaseHealthProbe(getPrismaClient()),
);
const getCacheRepository = memoize<CacheRepository>(
  () => new RedisCacheRepository(),
);
const getAiEngineGateway = memoize<AiEngineGateway>(
  () => new InternalAiEngineGateway(),
);
const getStorageRepository = memoize<StorageRepository>(
  () => new SeaweedStorageRepository(),
);
const getEmailSender = memoize<EmailSender>(() => {
  const env = getEnvConfig();
  if (env.email_server_host) {
    return new SmtpEmailSender({
      host: env.email_server_host,
      port: env.email_server_port ?? 587,
      user: env.email_server_user,
      password: env.email_server_password,
      from: env.email_from ?? 'Sineva <noreply@sineva.ai>',
    });
  }
  return new FakeEmailSender();
});

export { getPrismaClient, getEmailSender };

const getBreachedPasswordChecker = memoize<BreachedPasswordChecker>(() => {
  if (process.env.NODE_ENV === 'test') {
    return new FakeBreachedPasswordChecker();
  }
  return new PwnedPasswordsBreachedChecker();
});

export const getJwtAuthService = memoize<JwtAuthService>(() => {
  const env = getEnvConfig();
  return new JwtAuthService({
    prisma: getPrismaClient(),
    emailSender: getEmailSender(),
    auditLogger: defaultAuditLogger,
    breachedChecker: getBreachedPasswordChecker(),
    authSecret: env.auth_secret,
    appUrl: env.next_public_app_url,
  });
});

export const getGetAgentsUseCase = memoize(
  () => new GetAgentsUseCase(getAgentRepository(), getCacheRepository()),
);

export const getPresignStorageUploadUseCase = memoize(
  () => new PresignStorageUploadUseCase(getStorageRepository()),
);

export const getWorkspaceRepository = memoize<WorkspaceRepository>(
  () => new PrismaWorkspaceRepository(getPrismaClient()),
);
export const getWorkspaceMemberRepository = memoize<WorkspaceMemberRepository>(
  () => new PrismaWorkspaceMemberRepository(getPrismaClient()),
);

export const getCreateWorkspaceUseCase = memoize(
  () => new CreateWorkspaceUseCase(getWorkspaceRepository(), defaultAuditLogger),
);

export const getGetWorkspaceUseCase = memoize(
  () => new GetWorkspaceUseCase(getWorkspaceRepository()),
);

export const getUpdateWorkspaceUseCase = memoize(
  () => new UpdateWorkspaceUseCase(getWorkspaceRepository(), defaultAuditLogger),
);

export const getListUserWorkspacesUseCase = memoize(
  () => new ListUserWorkspacesUseCase(getWorkspaceRepository()),
);

export const getSigningKeyRepository = memoize<SigningKeyRepository>(
  () => new PrismaSigningKeyRepository(getPrismaClient()),
);

export const getContextSigner = memoize<ContextSigner>(() => {
  const env = getEnvConfig();
  return createDefaultContextSigner(
    env.internal_context_signing_key,
    env.internal_context_kid,
  );
});

export const getGoogleOAuthProvider = memoize<OAuthProvider>(() => {
  const env = getEnvConfig();
  return new GoogleOAuthProvider({
    clientId: env.google_client_id ?? 'dev-google-client-id',
    clientSecret: env.google_client_secret ?? 'dev-google-client-secret',
  });
});

export const getGitHubOAuthProvider = memoize<OAuthProvider>(() => {
  const env = getEnvConfig();
  return new GitHubOAuthProvider({
    clientId: env.github_client_id ?? 'dev-github-client-id',
    clientSecret: env.github_client_secret ?? 'dev-github-client-secret',
  });
});

export function getOAuthProvider(provider: string): OAuthProvider {
  if (provider === 'google') return getGoogleOAuthProvider();
  if (provider === 'github') return getGitHubOAuthProvider();
  throw new ValidationError(`Unsupported OAuth provider: ${provider}`, [
    {
      code: 'unsupported_oauth_provider',
      field: 'provider',
      detail: `Provider '${provider}' is not supported`,
    },
  ]);
}

export const getAccountRepository = memoize<AccountRepository>(
  () => new PrismaAccountRepository(getPrismaClient()),
);

export const getOAuthAuthService = memoize<OAuthAuthService>(
  () => new PrismaOAuthAuthService(getPrismaClient(), getJwtAuthService()),
);

export const getOAuthSignInUseCase = memoize(
  () => new OAuthSignInUseCase(getAccountRepository(), getOAuthAuthService(), defaultAuditLogger),
);

export const getLinkAccountUseCase = memoize(
  () => new LinkAccountUseCase(getAccountRepository(), defaultAuditLogger),
);

export const getUnlinkAccountUseCase = memoize(
  () => new UnlinkAccountUseCase(getAccountRepository(), defaultAuditLogger),
);

export const getListUserAccountsUseCase = memoize(
  () => new ListUserAccountsUseCase(getAccountRepository()),
);

export function initiateOAuthFlow(
  provider: string,
  returnTo?: string,
): { authUrl: string; signedCookieValue: string } {
  const env = getEnvConfig();
  const oauthProvider = getOAuthProvider(provider);
  const { state, codeChallenge, signedCookieValue } = generateOAuthState(
    provider,
    env.auth_secret,
    returnTo,
  );
  const redirectUri = `${env.next_public_app_url}/api/v1/auth/oauth/${provider}/callback`;
  const authUrl = oauthProvider.getAuthorizationUrl({
    state,
    codeChallenge,
    redirectUri,
  });
  return { authUrl, signedCookieValue };
}

export async function handleOAuthCallback(params: {
  provider: string;
  code: string;
  state: string;
  stateCookie?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ sessionToken: string; targetPath: string }> {
  const env = getEnvConfig();
  const statePayload = verifyOAuthState(params.stateCookie, params.state, env.auth_secret);
  const redirectUri = `${env.next_public_app_url}/api/v1/auth/oauth/${params.provider}/callback`;
  const oauthProvider = getOAuthProvider(params.provider);

  const profile = await oauthProvider.exchangeCode({
    code: params.code,
    codeVerifier: statePayload.codeVerifier,
    redirectUri,
  });

  const signInUseCase = getOAuthSignInUseCase();
  const result = await signInUseCase.execute({
    profile,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return {
    sessionToken: result.session.token,
    targetPath: statePayload.returnTo ?? '/w',
  };
}

export const getSystemHealthUseCase = memoize(
  () =>
    new GetSystemHealthUseCase(
      getDatabaseHealthProbe(),
      getCacheRepository(),
      getStorageRepository(),
      getAiEngineGateway(),
      getEnvConfig().s3_bucket_name,
    ),
);
