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
import { renderEmailTemplate } from './application/email/templates';
import type { InvitationRepository } from './domain/repositories/invitation_repository';
import type { OwnershipTransferRepository } from './domain/repositories/ownership_transfer_repository';
import type { LinkTokenService, McpGrantRevoker, MemberAccountLookup, MemberSessionRevoker } from './domain/members/member_ports';
import { PrismaInvitationRepository } from './infrastructure/database/prisma_invitation_repository';
import { PrismaOwnershipTransferRepository } from './infrastructure/database/prisma_ownership_transfer_repository';
import { PrismaMemberAccountLookup } from './infrastructure/database/prisma_member_account_lookup';
import { PrismaMemberSessionRevoker } from './infrastructure/database/prisma_member_session_revoker';
import { Sha256LinkTokenService } from './infrastructure/security/sha256_link_token_service';
import { NoopMcpGrantRevoker } from './infrastructure/security/noop_mcp_grant_revoker';
import { InviteMemberUseCase } from './application/use-cases/members/invite_member_use_case';
import { ListInvitationsUseCase } from './application/use-cases/members/list_invitations_use_case';
import { ResendInvitationUseCase } from './application/use-cases/members/resend_invitation_use_case';
import { RevokeInvitationUseCase } from './application/use-cases/members/revoke_invitation_use_case';
import { PreviewInvitationUseCase } from './application/use-cases/members/preview_invitation_use_case';
import { AcceptInvitationUseCase } from './application/use-cases/members/accept_invitation_use_case';
import { ListMembersUseCase } from './application/use-cases/members/list_members_use_case';
import { GetMemberUseCase } from './application/use-cases/members/get_member_use_case';
import { UpdateMemberUseCase } from './application/use-cases/members/update_member_use_case';
import { SetMemberSpecialistsUseCase } from './application/use-cases/members/set_member_specialists_use_case';
import { RemoveMemberUseCase } from './application/use-cases/members/remove_member_use_case';
import { LeaveWorkspaceUseCase } from './application/use-cases/members/leave_workspace_use_case';
import { RequestOwnershipTransferUseCase } from './application/use-cases/members/request_ownership_transfer_use_case';
import { GetOwnershipTransferUseCase } from './application/use-cases/members/get_ownership_transfer_use_case';
import { CancelOwnershipTransferUseCase } from './application/use-cases/members/cancel_ownership_transfer_use_case';
import { PreviewOwnershipTransferUseCase } from './application/use-cases/members/preview_ownership_transfer_use_case';
import { AcceptOwnershipTransferUseCase } from './application/use-cases/members/accept_ownership_transfer_use_case';
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
import type { InboxRepository } from './domain/repositories/inbox_repository';
import type { InboxLog } from './domain/inbox/inbox_log';
import { PrismaInboxRepository } from './infrastructure/database/prisma_inbox_repository';
import { LoggerInboxLog } from './infrastructure/logging/log_inbox_log';
import { CreateInboxItemUseCase } from './application/use-cases/inbox/create_inbox_item_use_case';
import { IngestRunInboxEventUseCase } from './application/use-cases/inbox/ingest_run_inbox_event_use_case';
import { ListInboxUseCase } from './application/use-cases/inbox/list_inbox_use_case';
import { GetInboxItemUseCase } from './application/use-cases/inbox/get_inbox_item_use_case';
import { GetInboxCountsUseCase } from './application/use-cases/inbox/get_inbox_counts_use_case';
import { MarkInboxItemReadUseCase } from './application/use-cases/inbox/mark_inbox_item_read_use_case';
import { DecideApprovalUseCase } from './application/use-cases/inbox/decide_approval_use_case';
import { RequestApprovalChangesUseCase } from './application/use-cases/inbox/request_approval_changes_use_case';
import { AnswerInputRequestUseCase } from './application/use-cases/inbox/answer_input_request_use_case';
import { DismissInboxItemUseCase } from './application/use-cases/inbox/dismiss_inbox_item_use_case';
import { ExpireInboxItemsUseCase } from './application/use-cases/inbox/expire_inbox_items_use_case';
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
      // Without a renderer the sender falls back to a one-line placeholder body,
      // so a real invitation would arrive with no link in it.
      renderer: renderEmailTemplate,
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
      inbox: getCreateInboxItemUseCase(),
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

// Members, invitations and ownership transfer (ADR-0029).
const getInvitationRepository = memoize<InvitationRepository>(
  () => new PrismaInvitationRepository(getPrismaClient()),
);
const getOwnershipTransferRepository = memoize<OwnershipTransferRepository>(
  () => new PrismaOwnershipTransferRepository(getPrismaClient()),
);
const getMemberAccountLookup = memoize<MemberAccountLookup>(
  () => new PrismaMemberAccountLookup(getPrismaClient()),
);
const getMemberSessionRevoker = memoize<MemberSessionRevoker>(
  () => new PrismaMemberSessionRevoker(getPrismaClient()),
);
// Replaced by the real revoker when the MCP server ships (M3).
const getMcpGrantRevoker = memoize<McpGrantRevoker>(() => new NoopMcpGrantRevoker());
const getLinkTokenService = memoize<LinkTokenService>(() => new Sha256LinkTokenService());
const systemClock = (): Date => new Date();
// The platform's view of which specialists exist (ADR-0024); the allowlist is
// validated against it, so it works while sineva-ai is down.
const knownSpecialistSlugs = (): readonly string[] => SPECIALIST_MANIFEST.map((entry) => entry.agent_slug);

export const getInviteMemberUseCase = memoize(
  () =>
    new InviteMemberUseCase({
      members: getWorkspaceMemberRepository(),
      invitations: getInvitationRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      email: getEmailSender(),
      audit: getAuditLogger(),
      entitlements: getEntitlementService(),
      transactions: getTransactionRunner(),
      clock: systemClock,
      appUrl: getEnvConfig().next_public_app_url,
      knownSpecialistSlugs: knownSpecialistSlugs(),
    }),
);
export const getListInvitationsUseCase = memoize(
  () => new ListInvitationsUseCase({ invitations: getInvitationRepository(), clock: systemClock }),
);
export const getResendInvitationUseCase = memoize(
  () =>
    new ResendInvitationUseCase({
      invitations: getInvitationRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      email: getEmailSender(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      clock: systemClock,
      appUrl: getEnvConfig().next_public_app_url,
    }),
);
export const getRevokeInvitationUseCase = memoize(
  () =>
    new RevokeInvitationUseCase({
      invitations: getInvitationRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      clock: systemClock,
    }),
);
export const getPreviewInvitationUseCase = memoize(
  () =>
    new PreviewInvitationUseCase({
      invitations: getInvitationRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      clock: systemClock,
    }),
);
export const getAcceptInvitationUseCase = memoize(
  () =>
    new AcceptInvitationUseCase({
      members: getWorkspaceMemberRepository(),
      invitations: getInvitationRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      audit: getAuditLogger(),
      entitlements: getEntitlementService(),
      transactions: getTransactionRunner(),
      clock: systemClock,
    }),
);
export const getListMembersUseCase = memoize(
  () => new ListMembersUseCase({ members: getWorkspaceMemberRepository() }),
);
export const getGetMemberUseCase = memoize(
  () => new GetMemberUseCase({ members: getWorkspaceMemberRepository() }),
);
export const getUpdateMemberUseCase = memoize(
  () =>
    new UpdateMemberUseCase({
      members: getWorkspaceMemberRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      mcp: getMcpGrantRevoker(),
      knownSpecialistSlugs: knownSpecialistSlugs(),
    }),
);
export const getSetMemberSpecialistsUseCase = memoize(
  () => new SetMemberSpecialistsUseCase(getUpdateMemberUseCase()),
);
export const getRemoveMemberUseCase = memoize(
  () =>
    new RemoveMemberUseCase({
      members: getWorkspaceMemberRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      sessions: getMemberSessionRevoker(),
      mcp: getMcpGrantRevoker(),
    }),
);
export const getLeaveWorkspaceUseCase = memoize(
  () =>
    new LeaveWorkspaceUseCase({
      members: getWorkspaceMemberRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      sessions: getMemberSessionRevoker(),
      mcp: getMcpGrantRevoker(),
    }),
);
export const getRequestOwnershipTransferUseCase = memoize(
  () =>
    new RequestOwnershipTransferUseCase({
      members: getWorkspaceMemberRepository(),
      transfers: getOwnershipTransferRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      email: getEmailSender(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      clock: systemClock,
      appUrl: getEnvConfig().next_public_app_url,
    }),
);
export const getGetOwnershipTransferUseCase = memoize(
  () =>
    new GetOwnershipTransferUseCase({
      members: getWorkspaceMemberRepository(),
      transfers: getOwnershipTransferRepository(),
      accounts: getMemberAccountLookup(),
      clock: systemClock,
    }),
);
export const getCancelOwnershipTransferUseCase = memoize(
  () =>
    new CancelOwnershipTransferUseCase({
      members: getWorkspaceMemberRepository(),
      transfers: getOwnershipTransferRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      clock: systemClock,
    }),
);
export const getPreviewOwnershipTransferUseCase = memoize(
  () =>
    new PreviewOwnershipTransferUseCase({
      transfers: getOwnershipTransferRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      clock: systemClock,
    }),
);
export const getAcceptOwnershipTransferUseCase = memoize(
  () =>
    new AcceptOwnershipTransferUseCase({
      members: getWorkspaceMemberRepository(),
      transfers: getOwnershipTransferRepository(),
      accounts: getMemberAccountLookup(),
      workspaces: getWorkspaceRepository(),
      tokens: getLinkTokenService(),
      email: getEmailSender(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      clock: systemClock,
    }),
);
// Inbox, approvals and input requests (ADR-0032).
export const getInboxRepository = memoize<InboxRepository>(
  () => new PrismaInboxRepository(getPrismaClient()),
);
const getInboxLog = memoize<InboxLog>(() => new LoggerInboxLog());
const getInboxDecisionDeps = memoize(() => ({
  inbox: getInboxRepository(),
  audit: getAuditLogger(),
  transactions: getTransactionRunner(),
  gateway: getAiEngineGateway(),
  contextSigner: getContextSigner(),
  log: getInboxLog(),
}));
export const getCreateInboxItemUseCase = memoize(
  () =>
    new CreateInboxItemUseCase({
      inbox: getInboxRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
    }),
);
export const getIngestRunInboxEventUseCase = memoize(
  () =>
    new IngestRunInboxEventUseCase({
      chatRuns: getChatRunRepository(),
      conversations: getConversationRepository(),
      creator: getCreateInboxItemUseCase(),
    }),
);
export const getListInboxUseCase = memoize(() => new ListInboxUseCase({ inbox: getInboxRepository() }));
export const getGetInboxItemUseCase = memoize(() => new GetInboxItemUseCase({ inbox: getInboxRepository() }));
export const getGetInboxCountsUseCase = memoize(() => new GetInboxCountsUseCase({ inbox: getInboxRepository() }));
export const getMarkInboxItemReadUseCase = memoize(
  () => new MarkInboxItemReadUseCase({ inbox: getInboxRepository() }),
);
export const getDecideApprovalUseCase = memoize(() => new DecideApprovalUseCase(getInboxDecisionDeps()));
export const getRequestApprovalChangesUseCase = memoize(
  () => new RequestApprovalChangesUseCase(getInboxDecisionDeps()),
);
export const getAnswerInputRequestUseCase = memoize(() => new AnswerInputRequestUseCase(getInboxDecisionDeps()));
export const getDismissInboxItemUseCase = memoize(() => new DismissInboxItemUseCase(getInboxDecisionDeps()));
export const getExpireInboxItemsUseCase = memoize(() => new ExpireInboxItemsUseCase(getInboxDecisionDeps()));
