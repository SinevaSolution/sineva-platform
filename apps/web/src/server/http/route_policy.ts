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
  'POST /api/v1/workspaces/{workspace_id}/inbox/{item_id}/read': {
    effect: 'change',
    audit: 'none',
    reason:
      'Opening an item only sets the caller\'s own read marker; no PRD auditable event covers it and it changes nothing another person can see.',
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
