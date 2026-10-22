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
  'POST /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}/messages': {
    effect: 'run',
    audit: 'none',
    // One reason covers both `none` values.
    reason:
      'Message text must never enter the audit log (the run is attributable via conversation id and usage events from M1), and runs are metered by usage events, not plan limits, until the ledger exists.',
    entitlement: 'none',
  },
  'POST /api/v1/agents': {
    effect: 'create',
    audit: 'none',
    reason:
      'Catalog registration is an owner or internal operation replaced by the specialist registry; it is not in any PRD auditable events list.',
    entitlement: 'none',
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
