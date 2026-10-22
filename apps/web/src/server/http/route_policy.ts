import { ENTITLEMENT_KEYS, type EntitlementKey } from '@/server/domain/entitlements/entitlements';

// One table that says, for every route that changes state, which audit events
// it produces and, for create and run paths, which entitlement it checks.
// `route_policy_inventory.test.ts` walks `src/app` and fails when a mutating
// route has no entry, when an entry points at a route that is gone, when an
// event name is not emitted anywhere in `src/server`, or when a `none` has no
// reason. Keeping it in one table (instead of an option on every `withAuth`
// call) means a new route cannot be added without a reviewer seeing this file
// change, and the test needs no parsing of handler bodies.

export type AuditMapping =
  | { audit: readonly string[] }
  | { audit: 'none'; reason: string };

export type EntitlementMapping =
  | { entitlement: EntitlementKey }
  | { entitlement: 'none'; reason: string };

// `create` and `run` paths must declare an entitlement (FR-BILL-34).
export type RouteEffect = 'create' | 'run' | 'change' | 'delete' | 'auth' | 'ingest';

export type MutatingRoutePolicy = { effect: RouteEffect } & AuditMapping & Partial<EntitlementMapping>;

// Key: `METHOD /path` with `{param}` segments, as in the OpenAPI document.
// A GET appears here only when it changes state (the OAuth callback signs in).
export const MUTATING_ROUTE_POLICY: Record<string, MutatingRoutePolicy> = {
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
    audit: ['user.signed_in', 'user.oauth_linked', 'user.signed_up'],
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
    reason: 'Conversations are not plan-gated; the entitlement list has no conversation key and usage is metered per reply from M1.',
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
    reason: 'This route is the audit writer for sineva-ai: each row carries the event the caller reports.',
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
    if ((policy.effect === 'create' || policy.effect === 'run') && policy.entitlement === undefined) {
      problems.push(`${key}: ${policy.effect} path must declare an entitlement key or a reasoned none`);
    }
  }
  return problems;
}
