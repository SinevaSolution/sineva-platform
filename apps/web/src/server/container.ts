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
import type { AuditLogger } from './domain/audit/audit_logger';
import type { AuditEventRepository } from './domain/repositories/audit_event_repository';
import type { TransactionRunner } from './domain/transactions/transaction_runner';
import type { EntitlementService } from './domain/entitlements/entitlements';
import { logger } from './infrastructure/logging/logger';
import { PrismaAuditRepository } from './infrastructure/database/prisma_audit_repository';
import { PrismaTransactionRunner } from './infrastructure/database/prisma_transaction_runner';
import { RepositoryAuditLogger } from './application/audit/repository_audit_logger';
import { ModeEntitlementService } from './application/entitlements/mode_entitlement_service';
import { IngestAuditEventUseCase } from './application/use-cases/audit/ingest_audit_event_use_case';
import { RotateSigningKeyUseCase } from './application/use-cases/security/rotate_signing_key_use_case';
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
import type { ConversationRepository } from './domain/repositories/conversation_repository';
import type { MessageRepository } from './domain/repositories/message_repository';
import { PrismaConversationRepository } from './infrastructure/database/prisma_conversation_repository';
import { PrismaMessageRepository } from './infrastructure/database/prisma_message_repository';
import { CreateConversationUseCase } from './application/use-cases/chat/create_conversation_use_case';
import { GetConversationUseCase } from './application/use-cases/chat/get_conversation_use_case';
import { ListConversationsUseCase } from './application/use-cases/chat/list_conversations_use_case';
import { ListMessagesUseCase } from './application/use-cases/chat/list_messages_use_case';
import { CreateMessageUseCase } from './application/use-cases/chat/create_message_use_case';
import type { ChatRunRepository } from './domain/repositories/chat_run_repository';
import { PrismaChatRunRepository } from './infrastructure/database/prisma_chat_run_repository';
import { LoggerRunRelayLog } from './infrastructure/logging/log_run_relay_log';
import { LogRunMetricsRecorder } from './infrastructure/metrics/log_run_metrics_recorder';
import { passThroughFrameGuard } from './domain/chat/run_frame_guard';
import { RunHub } from './application/chat/run_hub';
import { StreamRunUseCase } from './application/use-cases/chat/stream_run_use_case';
import { CancelRunUseCase } from './application/use-cases/chat/cancel_run_use_case';
import { RenameConversationUseCase } from './application/use-cases/chat/rename_conversation_use_case';
import { DeleteConversationUseCase } from './application/use-cases/chat/delete_conversation_use_case';
import type { UserProfileRepository } from './domain/repositories/user_profile_repository';
import { PrismaUserProfileRepository } from './infrastructure/database/prisma_user_profile_repository';
import { GetProfileUseCase } from './application/use-cases/profile/get_profile_use_case';
import { UpdateProfileUseCase } from './application/use-cases/profile/update_profile_use_case';

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
export const getAuditEventRepository = memoize<AuditEventRepository>(
  () => new PrismaAuditRepository(getPrismaClient()),
);
export const getTransactionRunner = memoize<TransactionRunner>(
  () => new PrismaTransactionRunner(getPrismaClient()),
);
// Persistent, fail-closed audit writer: a rejected write fails the action.
export const getAuditLogger = memoize<AuditLogger>(
  () => new RepositoryAuditLogger(getAuditEventRepository()),
);
// M0 has no plan catalog, so nothing resolves a limit; `open` mode never
// consults the provider and `shadow` or `enforced` would deny everything,
// which is why `enforced` needs an explicit production override. The
// per-workspace override and plan limits plug in here in M4.
export const getEntitlementService = memoize<EntitlementService>(
  () =>
    new ModeEntitlementService(
      getEnvConfig().entitlements_mode,
      { resolve: async () => null },
      // Ids, key names and counts only, through the allowlisted logger.
      (event) =>
        logger.info(event.event === 'entitlement.would_block' ? 'entitlement.would_block' : 'entitlement.checked', {
          workspace_id: typeof event.workspace_id === 'string' ? event.workspace_id : undefined,
          entitlement_key: String(event.key),
          mode: String(event.mode),
          allowed: Boolean(event.allowed),
          quantity: typeof event.quantity === 'number' ? event.quantity : undefined,
          reason: String(event.reason),
          plan_required: typeof event.plan_required === 'string' ? event.plan_required : undefined,
        }),
    ),
);

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
      from: env.email_from ?? 'Sineva <noreply@sineva.id>',
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
    auditLogger: getAuditLogger(),
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
  () => new CreateWorkspaceUseCase(
      getWorkspaceRepository(),
      getAuditLogger(),
      getEntitlementService(),
      getTransactionRunner(),
    ),
);

export const getGetWorkspaceUseCase = memoize(
  () => new GetWorkspaceUseCase(getWorkspaceRepository()),
);

export const getUpdateWorkspaceUseCase = memoize(
  () => new UpdateWorkspaceUseCase(getWorkspaceRepository(), getAuditLogger(), getTransactionRunner()),
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
  () => new OAuthSignInUseCase(getAccountRepository(), getOAuthAuthService(), getAuditLogger()),
);

export const getLinkAccountUseCase = memoize(
  () => new LinkAccountUseCase(getAccountRepository(), getAuditLogger()),
);

export const getUnlinkAccountUseCase = memoize(
  () => new UnlinkAccountUseCase(getAccountRepository(), getAuditLogger()),
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
    targetPath: statePayload.returnTo ?? '/',
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

export const getConversationRepository = memoize<ConversationRepository>(
  () => new PrismaConversationRepository(getPrismaClient()),
);

export const getMessageRepository = memoize<MessageRepository>(
  () => new PrismaMessageRepository(getPrismaClient()),
);

export const getCreateConversationUseCase = memoize(
  () => new CreateConversationUseCase(getConversationRepository(), getAuditLogger(), getTransactionRunner()),
);

export const getGetConversationUseCase = memoize(
  () => new GetConversationUseCase(getConversationRepository()),
);

export const getListConversationsUseCase = memoize(
  () => new ListConversationsUseCase(getConversationRepository()),
);

export const getListMessagesUseCase = memoize(
  () => new ListMessagesUseCase(getConversationRepository(), getMessageRepository()),
);

export const getCreateMessageUseCase = memoize(
  () => new CreateMessageUseCase(getConversationRepository(), getMessageRepository()),
);

export const getChatRunRepository = memoize<ChatRunRepository>(
  () => new PrismaChatRunRepository(getPrismaClient()),
);

// Live runs must be one registry per process. Next can evaluate this module
// more than once (dev reloads, separate route bundles), and two hubs would
// each start their own upstream stream for the same run, so the hub lives on
// globalThis.
const globalForRunHub = globalThis as typeof globalThis & { __sinevaRunHub?: RunHub };
export const getRunHub = (): RunHub => (globalForRunHub.__sinevaRunHub ??= new RunHub());

export const getStreamRunUseCase = memoize(
  () =>
    new StreamRunUseCase({
      conversations: getConversationRepository(),
      messages: getMessageRepository(),
      chatRuns: getChatRunRepository(),
      gateway: getAiEngineGateway(),
      contextSigner: getContextSigner(),
      hub: getRunHub(),
      // M0 emits no card events; the card validator plugs in here (FR-AX-09).
      guard: passThroughFrameGuard,
      metrics: new LogRunMetricsRecorder(),
      log: new LoggerRunRelayLog(),
    }),
);

export const getCancelRunUseCase = memoize(
  () =>
    new CancelRunUseCase({
      conversations: getConversationRepository(),
      messages: getMessageRepository(),
      chatRuns: getChatRunRepository(),
      gateway: getAiEngineGateway(),
      contextSigner: getContextSigner(),
      hub: getRunHub(),
      audit: getAuditLogger(),
    }),
);

export const getRenameConversationUseCase = memoize(
  () =>
    new RenameConversationUseCase(
      getConversationRepository(),
      getAuditLogger(),
      getTransactionRunner(),
    ),
);

export const getDeleteConversationUseCase = memoize(
  () =>
    new DeleteConversationUseCase({
      conversations: getConversationRepository(),
      messages: getMessageRepository(),
      chatRuns: getChatRunRepository(),
      cancelRun: getCancelRunUseCase(),
      audit: getAuditLogger(),
      log: new LoggerRunRelayLog(),
      transactions: getTransactionRunner(),
    }),
);

export const getUserProfileRepository = memoize<UserProfileRepository>(
  () => new PrismaUserProfileRepository(getPrismaClient()),
);

export const getGetProfileUseCase = memoize(
  () => new GetProfileUseCase(getUserProfileRepository()),
);

export const getUpdateProfileUseCase = memoize(
  () => new UpdateProfileUseCase(getUserProfileRepository(), getAuditLogger()),
);

export const getIngestAuditEventUseCase = memoize(
  () => new IngestAuditEventUseCase(getWorkspaceRepository(), getAuditLogger()),
);

export const getRotateSigningKeyUseCase = memoize(
  () => new RotateSigningKeyUseCase(getSigningKeyRepository(), getAuditLogger(), getTransactionRunner()),
);
