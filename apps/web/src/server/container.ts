import 'server-only';
import { randomBytes } from 'node:crypto';
import type { BusinessProfileRepository } from './domain/repositories/business_profile_repository';
import type {
  ChecklistRepository,
  InvitationReader,
  OnboardingStateRepository,
  ProfileScanRepository,
} from './domain/repositories/onboarding_repositories';
import type { WebsiteScanGateway } from './domain/repositories/website_scan_gateway';
import { PrismaBusinessProfileRepository } from './infrastructure/database/prisma_business_profile_repository';
import {
  PrismaChecklistRepository,
  PrismaInvitationReader,
  PrismaOnboardingStateRepository,
  PrismaProfileScanRepository,
} from './infrastructure/database/prisma_onboarding_repositories';
import { InternalWebsiteScanGateway } from './infrastructure/gateways/internal_website_scan_gateway';
import { BusinessProfileWriter } from './application/use-cases/business-profile/profile_writer';
import { GetBusinessProfileUseCase } from './application/use-cases/business-profile/get_business_profile_use_case';
import { SaveBusinessProfileUseCase } from './application/use-cases/business-profile/save_business_profile_use_case';
import { ListProfileVersionsUseCase } from './application/use-cases/business-profile/list_profile_versions_use_case';
import { GetProfileVersionUseCase } from './application/use-cases/business-profile/get_profile_version_use_case';
import { RestoreProfileVersionUseCase } from './application/use-cases/business-profile/restore_profile_version_use_case';
import { CreateOfferingUseCase } from './application/use-cases/business-profile/create_offering_use_case';
import { UpdateOfferingUseCase } from './application/use-cases/business-profile/update_offering_use_case';
import { DeleteOfferingUseCase } from './application/use-cases/business-profile/delete_offering_use_case';
import { CreatePolicyUseCase } from './application/use-cases/business-profile/create_policy_use_case';
import { UpdatePolicyUseCase } from './application/use-cases/business-profile/update_policy_use_case';
import { DeletePolicyUseCase } from './application/use-cases/business-profile/delete_policy_use_case';
import { GetProfilePackUseCase } from './application/use-cases/business-profile/get_profile_pack_use_case';
import { CreateFirstWorkspaceUseCase } from './application/use-cases/onboarding/create_first_workspace_use_case';
import { GetOnboardingUseCase } from './application/use-cases/onboarding/get_onboarding_use_case';
import { UpdateOnboardingUseCase } from './application/use-cases/onboarding/update_onboarding_use_case';
import { CompleteOnboardingUseCase } from './application/use-cases/onboarding/complete_onboarding_use_case';
import { RequestProfileScanUseCase } from './application/use-cases/onboarding/request_profile_scan_use_case';
import { GetProfileScanUseCase } from './application/use-cases/onboarding/get_profile_scan_use_case';
import { DeleteProfileScanUseCase } from './application/use-cases/onboarding/delete_profile_scan_use_case';
import { GetFirstTasksUseCase } from './application/use-cases/onboarding/get_first_tasks_use_case';
import { DismissFirstTaskUseCase } from './application/use-cases/onboarding/dismiss_first_task_use_case';
import { RecordChecklistEventUseCase } from './application/use-cases/onboarding/record_checklist_event_use_case';
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
import { OAuthReauthenticateUseCase } from './application/use-cases/auth/oauth_reauthenticate_use_case';
import {
  OAuthIntentCallbackUseCase,
  withOAuthNotice,
} from './application/use-cases/auth/oauth_intent_callback_use_case';
import { UnlinkAccountUseCase } from './application/use-cases/auth/unlink_account_use_case';
import { ListUserAccountsUseCase } from './application/use-cases/auth/list_user_accounts_use_case';
import type { AccountRepository } from './domain/repositories/account_repository';
import { PrismaAccountRepository } from './infrastructure/database/prisma_account_repository';
import type { OAuthAuthService } from './domain/auth/oauth_auth_service';
import { PrismaOAuthAuthService } from './infrastructure/auth/prisma_oauth_auth_service';
import type { OAuthIntent } from './domain/auth/oauth_intent';
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
      // Without a renderer the sender falls back to a one-line placeholder body,
      // so a real invitation would arrive with no link in it.
      // The app address lets templates point at their own images (Sino).
      renderer: (template, locale, params) =>
        renderEmailTemplate(template, locale, { ...params, app_url: env.next_public_app_url }),
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

// The browser-test stack points both providers at one fake identity provider.
// Real deployments leave OAUTH_TEST_IDP_URL unset (see env.ts for the guard).
function testIdpEndpoints(provider: 'google' | 'github') {
  const base = getEnvConfig().oauth_test_idp_url?.replace(/\/+$/, '');
  if (!base) return {};
  return provider === 'google'
    ? {
        authorizationEndpoint: `${base}/google/authorize`,
        tokenEndpoint: `${base}/google/token`,
        userinfoEndpoint: `${base}/google/userinfo`,
      }
    : {
        authorizationEndpoint: `${base}/github/authorize`,
        tokenEndpoint: `${base}/github/token`,
        userinfoEndpoint: `${base}/github/user`,
        emailsEndpoint: `${base}/github/emails`,
      };
}

export const getGoogleOAuthProvider = memoize<OAuthProvider>(() => {
  const env = getEnvConfig();
  return new GoogleOAuthProvider({
    clientId: env.google_client_id ?? 'dev-google-client-id',
    clientSecret: env.google_client_secret ?? 'dev-google-client-secret',
    ...testIdpEndpoints('google'),
  });
});

export const getGitHubOAuthProvider = memoize<OAuthProvider>(() => {
  const env = getEnvConfig();
  return new GitHubOAuthProvider({
    clientId: env.github_client_id ?? 'dev-github-client-id',
    clientSecret: env.github_client_secret ?? 'dev-github-client-secret',
    ...testIdpEndpoints('github'),
  });
});

/**
 * True when the deployment has real credentials for the provider. The
 * providers above fall back to placeholder ids so the sign-in page renders in
 * development; the link and re-confirm flows must not send a signed-in person
 * to a provider that will reject the placeholder.
 */
export function isOAuthProviderConfigured(provider: string): boolean {
  const env = getEnvConfig();
  if (provider === 'google') return Boolean(env.google_client_id && env.google_client_secret);
  if (provider === 'github') return Boolean(env.github_client_id && env.github_client_secret);
  return false;
}

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

export const getOAuthReauthenticateUseCase = memoize(
  () =>
    new OAuthReauthenticateUseCase(
      getAccountRepository(),
      // The JWT service owns the freshness window, shared with the password path.
      { markFresh: (userId, sessionId) => getJwtAuthService().markFresh(userId, sessionId) },
      getAuditLogger(),
    ),
);

export const getOAuthIntentCallbackUseCase = memoize(
  () => new OAuthIntentCallbackUseCase(getLinkAccountUseCase(), getOAuthReauthenticateUseCase()),
);

export function initiateOAuthFlow(
  provider: string,
  options: { returnTo?: string; intent?: OAuthIntent; userId?: string } = {},
): { authUrl: string; signedCookieValue: string } {
  const env = getEnvConfig();
  const oauthProvider = getOAuthProvider(provider);
  const { state, codeChallenge, signedCookieValue } = generateOAuthState(
    provider,
    env.auth_secret,
    options.returnTo,
    { intent: options.intent, userId: options.userId },
  );
  const redirectUri = `${env.next_public_app_url}/api/v1/auth/oauth/${provider}/callback`;
  const authUrl = oauthProvider.getAuthorizationUrl({
    state,
    codeChallenge,
    redirectUri,
  });
  return { authUrl, signedCookieValue };
}

/**
 * Where to send the person when the provider answered with an error (they
 * pressed "Cancel" on the consent screen). A link or re-confirm goes back to
 * the page that started it with a notice; a sign-in keeps the old behaviour
 * (null here, the route sends it to the sign-in page).
 */
export function describeOAuthFailureTarget(params: {
  stateCookie?: string;
  state?: string | null;
  error: string;
}): string | null {
  if (!params.state) return null;
  try {
    const payload = verifyOAuthState(params.stateCookie, params.state, getEnvConfig().auth_secret);
    if (payload.intent === 'sign_in') return null;
    return withOAuthNotice(payload.returnTo, params.error === 'access_denied' ? 'cancelled' : 'failed');
  } catch {
    return null;
  }
}

export async function handleOAuthCallback(params: {
  provider: string;
  code: string;
  state: string;
  stateCookie?: string;
  /** The browser's current session, when it has one. */
  session?: { userId: string; sessionId: string; freshUntil?: Date | null } | null;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ sessionToken?: string; targetPath: string }> {
  const env = getEnvConfig();
  const statePayload = verifyOAuthState(params.stateCookie, params.state, env.auth_secret);
  const redirectUri = `${env.next_public_app_url}/api/v1/auth/oauth/${params.provider}/callback`;
  const oauthProvider = getOAuthProvider(params.provider);

  const profile = await oauthProvider.exchangeCode({
    code: params.code,
    codeVerifier: statePayload.codeVerifier,
    redirectUri,
  });

  // Link and re-confirm act on the signed-in person and never open a new session.
  if (statePayload.intent !== 'sign_in') {
    return getOAuthIntentCallbackUseCase().execute({
      intent: statePayload.intent,
      boundUserId: statePayload.userId,
      session: params.session ?? null,
      profile,
      returnTo: statePayload.returnTo,
      requestId: params.requestId ?? 'oauth_intent',
    });
  }

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

// Business Profile, onboarding and the website scan (ADR-0031).
const now = (): Date => new Date();

export const getBusinessProfileRepository = memoize<BusinessProfileRepository>(
  () => new PrismaBusinessProfileRepository(getPrismaClient()),
);
const getOnboardingStateRepository = memoize<OnboardingStateRepository>(
  () => new PrismaOnboardingStateRepository(getPrismaClient()),
);
const getProfileScanRepository = memoize<ProfileScanRepository>(
  () => new PrismaProfileScanRepository(getPrismaClient()),
);
const getChecklistRepository = memoize<ChecklistRepository>(
  () => new PrismaChecklistRepository(getPrismaClient()),
);
const getInvitationReader = memoize<InvitationReader>(() => new PrismaInvitationReader(getPrismaClient()));
const getWebsiteScanGateway = memoize<WebsiteScanGateway>(() => new InternalWebsiteScanGateway());

const getBusinessProfileWriter = memoize(
  () => new BusinessProfileWriter(getBusinessProfileRepository(), getAuditLogger(), getTransactionRunner()),
);

export const getGetBusinessProfileUseCase = memoize(
  () => new GetBusinessProfileUseCase(getBusinessProfileRepository()),
);
export const getSaveBusinessProfileUseCase = memoize(
  () => new SaveBusinessProfileUseCase({ writer: getBusinessProfileWriter(), scans: getProfileScanRepository(), now }),
);
export const getListProfileVersionsUseCase = memoize(
  () => new ListProfileVersionsUseCase(getBusinessProfileRepository()),
);
export const getGetProfileVersionUseCase = memoize(
  () => new GetProfileVersionUseCase(getBusinessProfileRepository()),
);
export const getRestoreProfileVersionUseCase = memoize(
  () => new RestoreProfileVersionUseCase({ writer: getBusinessProfileWriter(), repo: getBusinessProfileRepository() }),
);
export const getCreateOfferingUseCase = memoize(
  () => new CreateOfferingUseCase({ writer: getBusinessProfileWriter(), repo: getBusinessProfileRepository(), now }),
);
export const getUpdateOfferingUseCase = memoize(
  () => new UpdateOfferingUseCase({ writer: getBusinessProfileWriter(), repo: getBusinessProfileRepository(), now }),
);
export const getDeleteOfferingUseCase = memoize(
  () => new DeleteOfferingUseCase({ writer: getBusinessProfileWriter() }),
);
export const getCreatePolicyUseCase = memoize(
  () => new CreatePolicyUseCase({ writer: getBusinessProfileWriter(), now }),
);
export const getUpdatePolicyUseCase = memoize(
  () => new UpdatePolicyUseCase({ writer: getBusinessProfileWriter(), repo: getBusinessProfileRepository(), now }),
);
export const getDeletePolicyUseCase = memoize(
  () => new DeletePolicyUseCase({ writer: getBusinessProfileWriter() }),
);
export const getGetProfilePackUseCase = memoize(
  () => new GetProfilePackUseCase(getBusinessProfileRepository()),
);

export const getCreateFirstWorkspaceUseCase = memoize(
  () =>
    new CreateFirstWorkspaceUseCase({
      workspaces: getWorkspaceRepository(),
      createWorkspace: getCreateWorkspaceUseCase(),
      profiles: getUserProfileRepository(),
      invitations: getInvitationReader(),
      states: getOnboardingStateRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      now,
      // Lowercase hex, 6 characters: a slug suffix, not an identifier.
      newSlugSuffix: () => randomBytes(3).toString('hex'),
    }),
);
export const getGetOnboardingUseCase = memoize(
  () =>
    new GetOnboardingUseCase({
      states: getOnboardingStateRepository(),
      checklist: getChecklistRepository(),
      invitations: getInvitationReader(),
    }),
);
export const getUpdateOnboardingUseCase = memoize(
  () =>
    new UpdateOnboardingUseCase({
      states: getOnboardingStateRepository(),
      workspaces: getWorkspaceRepository(),
      updateWorkspace: getUpdateWorkspaceUseCase(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      now,
      newSlugSuffix: () => randomBytes(2).toString('hex'),
    }),
);
export const getCompleteOnboardingUseCase = memoize(
  () =>
    new CompleteOnboardingUseCase({
      states: getOnboardingStateRepository(),
      writer: getBusinessProfileWriter(),
      scans: getProfileScanRepository(),
      checklist: getChecklistRepository(),
      audit: getAuditLogger(),
      transactions: getTransactionRunner(),
      now,
    }),
);
export const getRequestProfileScanUseCase = memoize(
  () =>
    new RequestProfileScanUseCase({
      scans: getProfileScanRepository(),
      gateway: getWebsiteScanGateway(),
      contextSigner: getContextSigner(),
      audit: getAuditLogger(),
      now,
    }),
);
export const getGetProfileScanUseCase = memoize(
  () => new GetProfileScanUseCase({ scans: getProfileScanRepository(), now }),
);
export const getDeleteProfileScanUseCase = memoize(
  () => new DeleteProfileScanUseCase({ scans: getProfileScanRepository() }),
);
export const getGetFirstTasksUseCase = memoize(
  () =>
    new GetFirstTasksUseCase({
      states: getOnboardingStateRepository(),
      repo: getBusinessProfileRepository(),
      now,
    }),
);
export const getDismissFirstTaskUseCase = memoize(
  () => new DismissFirstTaskUseCase({ states: getOnboardingStateRepository(), now }),
);
// Called by the code that owns a real event (a Library document reaching Ready,
// an accepted invitation); no route exposes it.
export const getRecordChecklistEventUseCase = memoize(
  () => new RecordChecklistEventUseCase({ checklist: getChecklistRepository() }),
);
