import 'server-only';
import { ListWorkspaceSpecialistsUseCase } from './application/use-cases/list_workspace_specialists_use_case';
import { GetSystemHealthUseCase } from './application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from './application/use-cases/presign_storage_upload_use_case';
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
import { SPECIALIST_MANIFEST } from '@/shared/specialists/manifest';
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
import type { MessageCardRepository } from './domain/repositories/message_card_repository';
import type { CardValidator } from './domain/chat/card_validator';
import { PrismaConversationRepository } from './infrastructure/database/prisma_conversation_repository';
import { PrismaMessageRepository } from './infrastructure/database/prisma_message_repository';
import { PrismaMessageCardRepository } from './infrastructure/database/prisma_message_card_repository';
import { CardSchemaValidator } from './infrastructure/cards/card_schema_validator';
import { LoggerCardRejectionLog } from './infrastructure/logging/log_card_rejection_log';
import { CardFrameGuard } from './application/chat/card_frame_guard';
import { CreateConversationUseCase } from './application/use-cases/chat/create_conversation_use_case';
import { GetConversationUseCase } from './application/use-cases/chat/get_conversation_use_case';
import { ListConversationsUseCase } from './application/use-cases/chat/list_conversations_use_case';
import { ListMessagesUseCase } from './application/use-cases/chat/list_messages_use_case';
import { CreateMessageUseCase } from './application/use-cases/chat/create_message_use_case';
import type { ChatRunRepository } from './domain/repositories/chat_run_repository';
import { PrismaChatRunRepository } from './infrastructure/database/prisma_chat_run_repository';
import { LoggerRunRelayLog } from './infrastructure/logging/log_run_relay_log';
import { LogRunMetricsRecorder } from './infrastructure/metrics/log_run_metrics_recorder';
import { RunHub } from './application/chat/run_hub';
import { StreamRunUseCase } from './application/use-cases/chat/stream_run_use_case';
import { CancelRunUseCase } from './application/use-cases/chat/cancel_run_use_case';
import { RenameConversationUseCase } from './application/use-cases/chat/rename_conversation_use_case';
import { DeleteConversationUseCase } from './application/use-cases/chat/delete_conversation_use_case';
import type { UserProfileRepository } from './domain/repositories/user_profile_repository';
import { PrismaUserProfileRepository } from './infrastructure/database/prisma_user_profile_repository';
import { GetProfileUseCase } from './application/use-cases/profile/get_profile_use_case';
import { UpdateProfileUseCase } from './application/use-cases/profile/update_profile_use_case';
import { GetMeUseCase } from './application/use-cases/profile/get_me_use_case';
import { GetPreferencesUseCase } from './application/use-cases/profile/get_preferences_use_case';
import { UpdatePreferencesUseCase } from './application/use-cases/profile/update_preferences_use_case';
import { UpdateMemberProfileUseCase } from './application/use-cases/profile/update_member_profile_use_case';
import { RequestAvatarUploadUseCase } from './application/use-cases/profile/request_avatar_upload_use_case';
import { CompleteAvatarUploadUseCase } from './application/use-cases/profile/complete_avatar_upload_use_case';
import { RemoveAvatarUseCase } from './application/use-cases/profile/remove_avatar_use_case';
import { ReadAvatarUseCase } from './application/use-cases/profile/read_avatar_use_case';
import { ImportOAuthAvatarUseCase } from './application/use-cases/profile/import_oauth_avatar_use_case';
import type { AvatarDeps } from './application/use-cases/profile/avatar_pipeline';
import type { UserPreferencesRepository } from './domain/repositories/user_preferences_repository';
import type { ObjectStore } from './domain/repositories/object_store';
import type { AvatarImageProcessor } from './domain/repositories/avatar_image_processor';
import type { RemoteImageFetcher } from './domain/repositories/remote_image_fetcher';
import { PrismaUserPreferencesRepository } from './infrastructure/database/prisma_user_preferences_repository';
import { SeaweedObjectStore } from './infrastructure/storage/seaweed_object_store';
import { SharpAvatarImageProcessor } from './infrastructure/media/sharp_avatar_image_processor';
import { AllowlistedRemoteImageFetcher } from './infrastructure/media/allowlisted_remote_image_fetcher';
import type { LibraryDeps } from './application/library/library_support';
import type { KnowledgeIngestGateway } from './domain/library/knowledge_ingest_gateway';
import type {
  LibraryDocumentRepository,
  LibraryFolderRepository,
  LibraryIngestEventRepository,
} from './domain/repositories/library_repository';
import { PrismaLibraryDocumentRepository } from './infrastructure/database/prisma_library_document_repository';
import { PrismaLibraryFolderRepository } from './infrastructure/database/prisma_library_folder_repository';
import { PrismaLibraryIngestEventRepository } from './infrastructure/database/prisma_library_ingest_event_repository';
import { InternalKnowledgeGateway } from './infrastructure/gateways/internal_knowledge_gateway';
import { LoggerLibraryLog } from './infrastructure/logging/log_library_log';
import { RequestLibraryUploadUseCase } from './application/use-cases/library/request_library_upload_use_case';
import { CompleteLibraryUploadUseCase } from './application/use-cases/library/complete_library_upload_use_case';
import { CreateLibraryDocumentUseCase } from './application/use-cases/library/create_library_document_use_case';
import { ListLibraryDocumentsUseCase } from './application/use-cases/library/list_library_documents_use_case';
import { GetLibraryDocumentUseCase } from './application/use-cases/library/get_library_document_use_case';
import { UpdateLibraryDocumentUseCase } from './application/use-cases/library/update_library_document_use_case';
import { DeleteLibraryDocumentUseCase } from './application/use-cases/library/delete_library_document_use_case';
import { ReindexLibraryDocumentUseCase } from './application/use-cases/library/reindex_library_document_use_case';
import { PreviewLibraryDocumentUseCase } from './application/use-cases/library/preview_library_document_use_case';
import { ApplyIngestEventUseCase } from './application/use-cases/library/apply_ingest_event_use_case';
import { TryLibraryRetrievalUseCase } from './application/use-cases/library/try_library_retrieval_use_case';
import { GetLibraryUsageUseCase } from './application/use-cases/library/get_library_usage_use_case';
import { CreateLibraryFolderUseCase } from './application/use-cases/library/create_library_folder_use_case';
import { ListLibraryFoldersUseCase } from './application/use-cases/library/list_library_folders_use_case';
import { UpdateLibraryFolderUseCase } from './application/use-cases/library/update_library_folder_use_case';
import { DeleteLibraryFolderUseCase } from './application/use-cases/library/delete_library_folder_use_case';

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

export const getListWorkspaceSpecialistsUseCase = memoize(
  () => new ListWorkspaceSpecialistsUseCase(getAiEngineGateway(), SPECIALIST_MANIFEST),
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

  // First sign-up only: a returning user's picture is theirs to manage, and
  // the provider's current picture must not replace one they chose.
  if (result.isNewUser && profile.avatar_url) {
    try {
      await getImportOAuthAvatarUseCase().execute({
        user_id: result.userId,
        remote_url: profile.avatar_url,
        provider: params.provider,
      });
    } catch (error) {
      // A picture never fails a sign-up; the failure is logged by class name.
      logger.warn('avatar.remote_fetch_failed', { reason: error instanceof Error ? error.name : 'unknown' });
    }
  }

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

export const getMessageCardRepository = memoize<MessageCardRepository>(
  () => new PrismaMessageCardRepository(getPrismaClient()),
);

export const getCardValidator = memoize<CardValidator>(() => new CardSchemaValidator());

export const getListMessagesUseCase = memoize(
  () =>
    new ListMessagesUseCase(
      getConversationRepository(),
      getMessageRepository(),
      getMessageCardRepository(),
      getCardValidator(),
    ),
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
      cards: getMessageCardRepository(),
      chatRuns: getChatRunRepository(),
      gateway: getAiEngineGateway(),
      contextSigner: getContextSigner(),
      hub: getRunHub(),
      // The platform is the authority on cards: every card frame is validated
      // here before it is stored or forwarded (FR-AX-09, ADR-0025).
      guard: new CardFrameGuard(getCardValidator(), new LoggerCardRejectionLog()),
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

export const getGetMeUseCase = memoize(() => new GetMeUseCase(getUserProfileRepository()));

const getUserPreferencesRepository = memoize<UserPreferencesRepository>(
  () => new PrismaUserPreferencesRepository(getPrismaClient()),
);
export const getGetPreferencesUseCase = memoize(
  () => new GetPreferencesUseCase(getUserPreferencesRepository()),
);
export const getUpdatePreferencesUseCase = memoize(
  () => new UpdatePreferencesUseCase(getUserPreferencesRepository(), getAuditLogger()),
);
export const getUpdateMemberProfileUseCase = memoize(
  () => new UpdateMemberProfileUseCase(getWorkspaceMemberRepository(), getAuditLogger()),
);

const getObjectStore = memoize<ObjectStore>(() => new SeaweedObjectStore());
const getAvatarImageProcessor = memoize<AvatarImageProcessor>(() => new SharpAvatarImageProcessor());
const getRemoteImageFetcher = memoize<RemoteImageFetcher>(() => new AllowlistedRemoteImageFetcher());
// Version and upload ids are random per upload; they are not database ids.
const newAvatarId = (): string => crypto.randomUUID();
const getAvatarDeps = memoize<AvatarDeps>(() => ({
  profiles: getUserProfileRepository(),
  store: getObjectStore(),
  processor: getAvatarImageProcessor(),
  audit: getAuditLogger(),
  newId: newAvatarId,
}));
export const getRequestAvatarUploadUseCase = memoize(
  () => new RequestAvatarUploadUseCase(getObjectStore(), newAvatarId),
);
export const getCompleteAvatarUploadUseCase = memoize(
  () => new CompleteAvatarUploadUseCase(getAvatarDeps()),
);
export const getRemoveAvatarUseCase = memoize(
  () => new RemoveAvatarUseCase(getUserProfileRepository(), getObjectStore(), getAuditLogger()),
);
export const getReadAvatarUseCase = memoize(
  () => new ReadAvatarUseCase(getUserProfileRepository(), getObjectStore()),
);
export const getImportOAuthAvatarUseCase = memoize(
  () => new ImportOAuthAvatarUseCase({ ...getAvatarDeps(), fetcher: getRemoteImageFetcher() }),
);

export const getIngestAuditEventUseCase = memoize(
  () => new IngestAuditEventUseCase(getWorkspaceRepository(), getAuditLogger()),
);

export const getRotateSigningKeyUseCase = memoize(
  () => new RotateSigningKeyUseCase(getSigningKeyRepository(), getAuditLogger(), getTransactionRunner()),
);

// --- Sino Library (ADR-0030) ------------------------------------------------
// The review-reminder sweep (`SendLibraryReviewRemindersUseCase`) has no getter
// on purpose: it needs the Inbox adapter of the Inbox backend, which does not
// exist yet, and wiring a no-op would make "reminded" a lie.
export const getLibraryDocumentRepository = memoize<LibraryDocumentRepository>(
  () => new PrismaLibraryDocumentRepository(getPrismaClient()),
);
export const getLibraryFolderRepository = memoize<LibraryFolderRepository>(
  () => new PrismaLibraryFolderRepository(getPrismaClient()),
);
export const getLibraryIngestEventRepository = memoize<LibraryIngestEventRepository>(
  () => new PrismaLibraryIngestEventRepository(getPrismaClient()),
);
const getKnowledgeIngestGateway = memoize<KnowledgeIngestGateway>(() => new InternalKnowledgeGateway());

const getLibraryDeps = memoize<LibraryDeps>(() => ({
  documents: getLibraryDocumentRepository(),
  folders: getLibraryFolderRepository(),
  events: getLibraryIngestEventRepository(),
  gateway: getKnowledgeIngestGateway(),
  contextSigner: getContextSigner(),
  store: getObjectStore(),
  audit: getAuditLogger(),
  entitlements: getEntitlementService(),
  transactions: getTransactionRunner(),
  log: new LoggerLibraryLog(),
  // Correlation id sent to sineva-ai, not a database id.
  newJobId: () => crypto.randomUUID(),
  now: () => new Date(),
}));

export const getRequestLibraryUploadUseCase = memoize(() => new RequestLibraryUploadUseCase(getLibraryDeps()));
export const getCompleteLibraryUploadUseCase = memoize(() => new CompleteLibraryUploadUseCase(getLibraryDeps()));
export const getCreateLibraryDocumentUseCase = memoize(
  () => new CreateLibraryDocumentUseCase({ ...getLibraryDeps(), conversations: getConversationRepository() }),
);
export const getListLibraryDocumentsUseCase = memoize(() => new ListLibraryDocumentsUseCase(getLibraryDeps()));
export const getGetLibraryDocumentUseCase = memoize(() => new GetLibraryDocumentUseCase(getLibraryDeps()));
export const getUpdateLibraryDocumentUseCase = memoize(() => new UpdateLibraryDocumentUseCase(getLibraryDeps()));
export const getDeleteLibraryDocumentUseCase = memoize(() => new DeleteLibraryDocumentUseCase(getLibraryDeps()));
export const getReindexLibraryDocumentUseCase = memoize(() => new ReindexLibraryDocumentUseCase(getLibraryDeps()));
export const getPreviewLibraryDocumentUseCase = memoize(() => new PreviewLibraryDocumentUseCase(getLibraryDeps()));
export const getApplyIngestEventUseCase = memoize(() => new ApplyIngestEventUseCase(getLibraryDeps()));
export const getTryLibraryRetrievalUseCase = memoize(() => new TryLibraryRetrievalUseCase(getLibraryDeps()));
export const getGetLibraryUsageUseCase = memoize(() => new GetLibraryUsageUseCase(getLibraryDeps()));
export const getCreateLibraryFolderUseCase = memoize(() => new CreateLibraryFolderUseCase(getLibraryDeps()));
export const getListLibraryFoldersUseCase = memoize(() => new ListLibraryFoldersUseCase(getLibraryDeps()));
export const getUpdateLibraryFolderUseCase = memoize(() => new UpdateLibraryFolderUseCase(getLibraryDeps()));
export const getDeleteLibraryFolderUseCase = memoize(() => new DeleteLibraryFolderUseCase(getLibraryDeps()));
