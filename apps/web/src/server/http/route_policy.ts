import { ENTITLEMENT_KEYS, type EntitlementKey } from '@/server/domain/entitlements/entitlements';

// One table that says, for every route that changes state, which audit events
// it produces and, for create and run paths, which entitlement it checks.
// `route_policy_inventory.test.ts` walks `src/app` and fails when a mutating
// route has no entry, when an entry points at a route that is gone, when an
// event name is not emitted anywhere in `src/server`, or when a `none` has no
// reason. Keeping it in one table (instead of an option on every `withAuth`
// call) means a new route cannot be added without a reviewer seeing this file
// change, and the test needs no parsing of handler bodies.

export type AuditMapping = { audit: readonly string[] } | { audit: 'none'; reason: string };

export type EntitlementMapping =
  { entitlement: EntitlementKey } | { entitlement: 'none'; reason: string };

// `create` and `run` paths must declare an entitlement (FR-BILL-34).
export type RouteEffect = 'create' | 'run' | 'change' | 'delete' | 'auth' | 'ingest';

export type MutatingRoutePolicy = { effect: RouteEffect } & AuditMapping &
  Partial<EntitlementMapping>;

// Key: `METHOD /path` with `{param}` segments, as in the OpenAPI document.
// A GET appears here only when it changes state (the OAuth callback signs in).
export const MUTATING_ROUTE_POLICY: Record<string, MutatingRoutePolicy> = {
  'POST /api/v1/me/first-workspace': {
    effect: 'create',
    audit: ['workspace.created', 'onboarding.started'],
    entitlement: ENTITLEMENT_KEYS.WORKSPACES,
  },
  'PATCH /api/v1/workspaces/{workspace_id}/onboarding': {
    effect: 'change',
    audit: [
      'onboarding.started',
      'onboarding.step_completed',
      'onboarding.skipped',
      'onboarding.completed',
    ],
  },
  'POST /api/v1/workspaces/{workspace_id}/onboarding/complete': {
    effect: 'change',
    audit: ['profile.updated', 'onboarding.completed'],
  },
  'POST /api/v1/workspaces/{workspace_id}/onboarding/first-tasks/{task_id}/dismiss': {
    effect: 'change',
    audit: 'none',
    reason:
      'Dismissing a personal suggestion changes no shared business data and stores no task content in the audit log.',
  },
  'PUT /api/v1/workspaces/{workspace_id}/profile': { effect: 'change', audit: ['profile.updated'] },
  'POST /api/v1/workspaces/{workspace_id}/profile/versions/{version}/restore': {
    effect: 'change',
    audit: ['profile.version_restored'],
  },
  'POST /api/v1/workspaces/{workspace_id}/profile/scans': {
    effect: 'run',
    audit: ['profile.scan_requested', 'profile.scan_completed', 'profile.scan_failed'],
    entitlement: 'none',
    reason:
      'The rolling workspace scan quota is enforced transactionally by the scan repository; no plan entitlement is defined.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/profile/scans/{scan_id}': {
    effect: 'delete',
    audit: 'none',
    reason:
      'Discarding an ephemeral scan removes its suggestions and keeps the quota record; no shared profile data changes.',
  },
  'POST /api/v1/workspaces/{workspace_id}/profile/offerings': {
    effect: 'create',
    audit: ['profile.updated'],
    entitlement: 'none',
    reason:
      'Business profile entries have fixed validation caps and do not consume a plan resource.',
  },
  'PATCH /api/v1/workspaces/{workspace_id}/profile/offerings/{offering_id}': {
    effect: 'change',
    audit: ['profile.updated'],
  },
  'DELETE /api/v1/workspaces/{workspace_id}/profile/offerings/{offering_id}': {
    effect: 'delete',
    audit: ['profile.updated'],
  },
  'POST /api/v1/workspaces/{workspace_id}/profile/policies': {
    effect: 'create',
    audit: ['policy.created'],
    entitlement: 'none',
    reason:
      'Business profile entries have fixed validation caps and do not consume a plan resource.',
  },
  'PATCH /api/v1/workspaces/{workspace_id}/profile/policies/{policy_id}': {
    effect: 'change',
    audit: ['policy.updated'],
  },
  'DELETE /api/v1/workspaces/{workspace_id}/profile/policies/{policy_id}': {
    effect: 'delete',
    audit: ['profile.updated'],
  },

  'POST /api/v1/auth/sign-up': {
    effect: 'auth',
    audit: ['user.signed_up'],
  },
  'POST /api/v1/auth/sign-in': {
    effect: 'auth',
    audit: ['user.signed_in', 'user.sign_in_failed', 'user.locked_out'],
  },
  'POST /api/v1/auth/sign-out': {
    effect: 'auth',
    audit: ['session.revoked'],
  },
  'POST /api/v1/auth/reauthenticate': {
    effect: 'auth',
    audit: 'none',
    reason:
      'Only extends the freshness window of an existing session; failed attempts are throttled by the lockout and no PRD auditable event covers it.',
  },
  'POST /api/v1/auth/verify-email': {
    effect: 'auth',
    audit: ['user.email_verified'],
  },
  'POST /api/v1/auth/request-password-reset': {
    effect: 'auth',
    audit: ['user.password_reset_requested'],
  },
  'POST /api/v1/auth/reset-password': {
    effect: 'auth',
    audit: ['user.password_reset_completed'],
  },
  'GET /api/v1/auth/oauth/{provider}/callback': {
    effect: 'auth',
    audit: ['user.signed_in', 'user.oauth_linked', 'user.signed_up', 'user.reauthenticated'],
  },
  'DELETE /api/v1/me/accounts/{provider}': {
    effect: 'delete',
    audit: ['user.oauth_unlinked'],
  },
  'PATCH /api/v1/me/profile': {
    effect: 'change',
    audit: ['user.profile_updated'],
  },
  'PATCH /api/v1/me': {
    effect: 'change',
    audit: ['user.profile_updated'],
  },
  'PATCH /api/v1/me/preferences': {
    effect: 'change',
    audit: ['user.preferences_updated'],
  },
  'PATCH /api/v1/workspaces/{workspace_id}/members/me': {
    effect: 'change',
    audit: ['member.profile_updated'],
  },
  'POST /api/v1/me/avatar': {
    effect: 'create',
    audit: 'none',
    reason:
      'Only issues a presigned URL for a pending object and changes nothing the person can see; the avatar switch is audited by the complete step.',
    entitlement: 'none',
    // One reason covers both `none` values; avatars are not plan-gated.
  },
  'POST /api/v1/me/avatar/complete': {
    effect: 'change',
    audit: ['user.avatar_updated'],
  },
  'DELETE /api/v1/me/avatar': {
    effect: 'delete',
    audit: ['user.avatar_updated'],
  },
  'POST /api/v1/workspaces': {
    effect: 'create',
    audit: ['workspace.created'],
    entitlement: ENTITLEMENT_KEYS.WORKSPACES,
  },
  'PATCH /api/v1/workspaces/{workspace_id}': {
    effect: 'change',
    audit: ['workspace.updated'],
  },
  'POST /api/v1/workspaces/{workspace_id}/conversations': {
    effect: 'create',
    audit: ['conversation.created'],
    entitlement: 'none',
    reason:
      'Conversations are not plan-gated; the entitlement list has no conversation key and usage is metered per reply from M1.',
  },
  'PATCH /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}': {
    effect: 'change',
    audit: ['conversation.renamed'],
    entitlement: 'none',
    reason: 'Renaming your own chat spends nothing, so no plan limit applies.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}': {
    effect: 'delete',
    audit: ['conversation.deleted'],
    entitlement: 'none',
    reason: 'Deleting your own chat spends nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}/messages': {
    effect: 'run',
    audit: 'none',
    // One reason covers both `none` values.
    reason:
      'Message text must never enter the audit log (the run is attributable via conversation id and usage events from M1), and runs are metered by usage events, not plan limits, until the ledger exists.',
    entitlement: 'none',
  },
  'POST /api/v1/workspaces/{workspace_id}/runs/{run_id}/cancel': {
    effect: 'change',
    audit: ['chat.run.cancel_requested'],
    entitlement: 'none',
    reason: 'Stopping a reply spends nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/invitations': {
    effect: 'create',
    audit: ['member.invited'],
    entitlement: ENTITLEMENT_KEYS.MEMBERS,
  },
  'POST /api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/resend': {
    effect: 'change',
    audit: ['member.invited'],
    entitlement: 'none',
    reason:
      'A resend replaces the token of an invitation that already exists and adds no seat; the seat is checked when the invitation is created and when it is accepted.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/invitations/{invitation_id}': {
    effect: 'delete',
    audit: ['invitation.revoked'],
    entitlement: 'none',
    reason:
      'Revoking a pending invitation frees a seat and spends nothing, so no plan limit applies.',
  },
  'POST /api/v1/invitations/{token}/accept': {
    effect: 'create',
    audit: ['invitation.accepted', 'invitation.expired'],
    entitlement: ENTITLEMENT_KEYS.MEMBERS,
  },
  'PATCH /api/v1/workspaces/{workspace_id}/members/{member_id}': {
    effect: 'change',
    audit: ['member.role_changed', 'member.specialist_access_changed'],
    entitlement: 'none',
    reason:
      'Changing a role or specialist scope does not add a member, so no seat limit applies; per-specialist plan gating belongs to specialist enablement.',
  },
  'PUT /api/v1/workspaces/{workspace_id}/members/{member_id}/specialists': {
    effect: 'change',
    audit: ['member.specialist_access_changed'],
    entitlement: 'none',
    reason:
      'The allowlist only narrows what a member may use among specialists the workspace already has, so no plan limit applies.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/members/{member_id}': {
    effect: 'delete',
    audit: ['member.removed'],
    entitlement: 'none',
    reason: 'Removing a member frees a seat and spends nothing, so no plan limit applies.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/members/me': {
    effect: 'delete',
    audit: ['member.left'],
    entitlement: 'none',
    reason: 'Leaving frees a seat and spends nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/transfer-ownership': {
    effect: 'change',
    audit: ['workspace.ownership_transfer_requested'],
    entitlement: 'none',
    reason:
      'Requesting a transfer changes nothing until the admin confirms and moves no seat, so no plan limit applies.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/transfer-ownership': {
    effect: 'delete',
    audit: ['workspace.ownership_transfer_cancelled'],
    entitlement: 'none',
    reason: 'Cancelling a pending transfer spends nothing, so no plan limit applies.',
  },
  'POST /api/v1/ownership-transfers/{token}/accept': {
    effect: 'change',
    audit: ['workspace.ownership_transferred'],
    entitlement: 'none',
    reason: 'The swap exchanges two existing roles and adds no member, so no seat limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/inbox/{item_id}/read': {
    effect: 'change',
    audit: 'none',
    reason:
      "Opening an item only sets the caller's own read marker; no PRD auditable event covers it and it changes nothing another person can see.",
    entitlement: 'none',
  },
  'POST /api/v1/workspaces/{workspace_id}/inbox/{item_id}/dismiss': {
    effect: 'change',
    audit: ['input.dismissed'],
    entitlement: 'none',
    reason: 'Decisions on the Inbox cost nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/inbox/{item_id}/answer': {
    effect: 'change',
    audit: ['input.answered'],
    entitlement: 'none',
    reason: 'Decisions on the Inbox cost nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/approvals/{approval_id}/decision': {
    effect: 'change',
    audit: ['approval.approved', 'approval.rejected', 'approval.edited'],
    entitlement: 'none',
    reason: 'Decisions on the Inbox cost nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/approvals/{approval_id}/changes': {
    effect: 'change',
    audit: ['approval.changes_requested'],
    entitlement: 'none',
    reason: 'Decisions on the Inbox cost nothing, so no plan limit applies.',
  },
  'POST /internal/v1/approvals': {
    effect: 'ingest',
    audit: ['approval.requested'],
  },
  'POST /api/internal/v1/approvals': {
    effect: 'ingest',
    audit: ['approval.requested'],
  },
  'POST /internal/v1/input-requests': {
    effect: 'ingest',
    audit: ['input.requested'],
  },
  'POST /api/internal/v1/input-requests': {
    effect: 'ingest',
    audit: ['input.requested'],
  },
  'POST /internal/v1/inbox/expire': {
    effect: 'ingest',
    audit: ['approval.expired', 'input.expired'],
  },
  'POST /api/internal/v1/inbox/expire': {
    effect: 'ingest',
    audit: ['approval.expired', 'input.expired'],
  },
  'POST /api/v1/workspaces/{workspace_id}/connections/oauth/start': {
    effect: 'change',
    audit: ['connection.oauth_started'],
    entitlement: ENTITLEMENT_KEYS.CONNECTIONS,
  },
  'GET /api/v1/connections/oauth/callback': {
    effect: 'create',
    audit: ['connection.created', 'connection.reconnected', 'connection.scope_downgraded'],
    entitlement: 'none',
    reason:
      'The connection limit is checked when the flow starts; the callback only completes a flow that already passed that check.',
  },
  'POST /internal/v1/jobs/tick': {
    effect: 'ingest',
    audit: ['connection.token_refreshed', 'connection.refresh_failed', 'connection.needs_reconnect'],
  },
  'POST /api/internal/v1/jobs/tick': {
    effect: 'ingest',
    audit: ['connection.token_refreshed', 'connection.refresh_failed', 'connection.needs_reconnect'],
  },
  'POST /api/v1/workspaces/{workspace_id}/connections/secret': {
    effect: 'create',
    audit: ['connection.created', 'connection.secret_rotated'],
    entitlement: ENTITLEMENT_KEYS.CONNECTIONS,
  },
  'POST /api/v1/workspaces/{workspace_id}/connections/{connection_id}/reconnect': {
    effect: 'change',
    audit: ['connection.oauth_started'],
  },
  'POST /api/v1/workspaces/{workspace_id}/connections/{connection_id}/test': {
    effect: 'change',
    audit: ['connection.needs_reconnect'],
  },
  'PUT /api/v1/workspaces/{workspace_id}/connections/{connection_id}/grants': {
    effect: 'change',
    audit: ['connection.grant_changed'],
  },
  'DELETE /api/v1/workspaces/{workspace_id}/connections/{connection_id}': {
    effect: 'delete',
    audit: ['connection.revoked'],
  },
  'POST /internal/v1/connections/mass-revoke': {
    effect: 'ingest',
    audit: ['connection.revoked'],
  },
  'POST /api/internal/v1/connections/mass-revoke': {
    effect: 'ingest',
    audit: ['connection.revoked'],
  },
  'POST /internal/v1/vault/rotate-keys': {
    effect: 'ingest',
    audit: 'none',
    reason:
      'Rewraps data keys under the current key and returns counts only; no workspace data changes, and the operator command is itself an infrastructure runbook step.',
  },
  'POST /api/internal/v1/vault/rotate-keys': {
    effect: 'ingest',
    audit: 'none',
    reason: 'Alias of POST /internal/v1/vault/rotate-keys.',
  },
  'POST /internal/v1/connections/reconcile': {
    effect: 'ingest',
    audit: 'none',
    reason:
      'Only queues a sweep; the health jobs it creates write connection.needs_reconnect for every connection they mark.',
  },
  'POST /api/internal/v1/connections/reconcile': {
    effect: 'ingest',
    audit: 'none',
    reason: 'Alias of POST /internal/v1/connections/reconcile.',
  },
  'POST /api/v1/workspaces/{workspace_id}/library/uploads': {
    effect: 'create',
    audit: 'none',
    reason:
      'Presign only: the row stays a pending upload, not a document, until complete, which writes library.document.uploaded.',
    // The use case also checks `library.storage_mb` and, for scannable types, `library.ocr_pages.monthly`.
    entitlement: ENTITLEMENT_KEYS.DOCUMENTS,
  },
  'POST /api/v1/workspaces/{workspace_id}/library/documents/{document_id}/complete': {
    effect: 'change',
    audit: ['library.document.uploaded'],
    entitlement: 'none',
    reason:
      'The document, storage and OCR quotas were checked when the upload was presigned; completing adds no second document or storage.',
  },
  'POST /api/v1/workspaces/{workspace_id}/library/documents': {
    effect: 'create',
    audit: ['library.document.uploaded'],
    entitlement: ENTITLEMENT_KEYS.DOCUMENTS,
  },
  'PATCH /api/v1/workspaces/{workspace_id}/library/documents/{document_id}': {
    effect: 'change',
    audit: ['library.document.scope_changed'],
    entitlement: 'none',
    reason:
      'Renaming, moving or setting a review interval spends nothing, and a scope change only relabels existing chunks without adding storage.',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/library/documents/{document_id}': {
    effect: 'delete',
    audit: ['library.document.deleted'],
    entitlement: 'none',
    reason: 'Deleting a document frees storage and spends nothing, so no plan limit applies.',
  },
  'POST /api/v1/workspaces/{workspace_id}/library/documents/{document_id}/reindex': {
    effect: 'run',
    audit: ['library.document.reindexed'],
    // Reading again uses OCR pages for scannable documents.
    entitlement: ENTITLEMENT_KEYS.OCR_PAGES,
  },
  'POST /api/v1/workspaces/{workspace_id}/library/folders': {
    effect: 'create',
    audit: 'none',
    reason:
      'Folder structure is not a PRD auditable event; what a folder holds is audited per document.',
    entitlement: 'none',
  },
  'PATCH /api/v1/workspaces/{workspace_id}/library/folders/{folder_id}': {
    effect: 'change',
    audit: 'none',
    reason:
      'Renaming or moving a folder is not a PRD auditable event; what a folder holds is audited per document.',
    entitlement: 'none',
  },
  'DELETE /api/v1/workspaces/{workspace_id}/library/folders/{folder_id}': {
    effect: 'delete',
    audit: 'none',
    reason:
      'Only an empty folder can be deleted, so no document is removed here; folder structure is not a PRD auditable event.',
    entitlement: 'none',
  },
  'POST /api/v1/workspaces/{workspace_id}/library/try': {
    effect: 'run',
    audit: 'none',
    // One reason covers both `none` values.
    reason:
      'The test question must never enter the audit log, and retrieval alone calls no model, so it is metered by usage events once the ledger exists, not by plan limits.',
    entitlement: 'none',
  },
  'POST /api/internal/v1/library/ingest-events': {
    effect: 'ingest',
    audit: ['library.document.indexed', 'library.document.failed'],
  },
  'POST /api/v1/storage/presign': {
    effect: 'create',
    audit: 'none',
    reason:
      'Issues a presigned URL only and records nothing; uploads become auditable with the Library metadata records, which also add the storage entitlement check.',
    entitlement: 'none',
  },
  'POST /internal/v1/audit-events': {
    effect: 'ingest',
    audit: 'none',
    reason:
      'This route is the audit writer for sineva-ai: each row carries the event the caller reports.',
  },
  'POST /api/internal/v1/audit-events': {
    effect: 'ingest',
    audit: 'none',
    reason: 'Alias of POST /internal/v1/audit-events, the audit writer for sineva-ai.',
  },
};

/** Structural problems of a policy table; the inventory test asserts none for the real one. */
export function findPolicyViolations(table: Record<string, MutatingRoutePolicy>): string[] {
  const problems: string[] = [];
  for (const [key, policy] of Object.entries(table)) {
    if (policy.audit === 'none') {
      if (!('reason' in policy) || policy.reason.trim().length < 20) {
        problems.push(`${key}: audit none needs a reason of at least 20 characters`);
      }
    } else if (policy.audit.length === 0) {
      problems.push(`${key}: lists no audit events`);
    }
    if (
      (policy.effect === 'create' || policy.effect === 'run') &&
      policy.entitlement === undefined
    ) {
      problems.push(
        `${key}: ${policy.effect} path must declare an entitlement key or a reasoned none`,
      );
    }
  }
  return problems;
}
