// Inbox model (ADR-0032). Platform-owned records; sineva-ai only produces events.

export type InboxItemKind = 'approval' | 'input_request' | 'result';
export const INBOX_ITEM_KINDS: readonly InboxItemKind[] = ['approval', 'input_request', 'result'];

/** `open` waits for a person; the other three are final. */
export type InboxItemState = 'open' | 'resolved' | 'dismissed' | 'expired';

export type InboxTab = 'needs_review' | 'needs_input' | 'done';
export const INBOX_TABS: readonly InboxTab[] = ['needs_review', 'needs_input', 'done'];

export type InboxSourceType = 'chat' | 'room' | 'system';

export interface InboxItemEntity {
  id: string;
  workspace_id: string;
  /** The person whose chat produced the item. Null means every approver. */
  recipient_user_id: string | null;
  kind: InboxItemKind;
  state: InboxItemState;
  agent_slug: string | null;
  /** Producer-supplied one-liner. Untrusted text: render escaped. */
  title: string;
  /** Platform-built sentence: a catalog key plus structured params, localized at render. */
  summary_key: string;
  summary_params: Record<string, unknown>;
  source_type: InboxSourceType;
  /** The platform run handle for chat sources. */
  source_id: string | null;
  approval_id: string | null;
  input_request_id: string | null;
  /** Idempotency key for creation, unique per workspace. */
  dedupe_key: string | null;
  expires_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Tab mapping of FR-INBOX-02, as far as M1 kinds go. */
export function tabOf(item: Pick<InboxItemEntity, 'kind' | 'state'>): InboxTab {
  if (item.state !== 'open' || item.kind === 'result') return 'done';
  return item.kind === 'approval' ? 'needs_review' : 'needs_input';
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export const TERMINAL_APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'approved',
  'rejected',
  'expired',
  'cancelled',
];

export function isTerminalApproval(status: ApprovalStatus): boolean {
  return TERMINAL_APPROVAL_STATUSES.includes(status);
}

export type ApprovalDecision = 'approve' | 'reject' | 'changes';

export interface ApprovalEntity {
  id: string;
  workspace_id: string;
  inbox_item_id: string;
  agent_slug: string;
  source_type: InboxSourceType;
  /** The platform run handle. */
  source_id: string | null;
  /** sineva-ai run id, the target of the resume call. */
  run_id: string | null;
  upstream_approval_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  risk_level: 'low' | 'medium' | 'high';
  /** Why a person decides: a guardrail, or the user's setting. */
  requirement: 'guardrail' | 'policy';
  guardrail_reason: string | null;
  status: ApprovalStatus;
  revision: number;
  /** Optimistic version: bumped by every committed change. */
  version: number;
  /** A change was requested and the specialist has not answered with a new revision yet. */
  awaiting_revision: boolean;
  change_request: string | null;
  /** In-flight decision claim; the row is still `pending`. */
  claimed_by: string | null;
  claimed_decision: ApprovalDecision | null;
  claimed_at: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  /** When sineva-ai was told the outcome; null while a resume is owed. */
  resume_delivered_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRevisionEntity {
  id: string;
  approval_id: string;
  revision: number;
  payload: Record<string, unknown>;
  payload_hash: string;
  created_by: 'specialist' | 'user';
  created_by_user_id: string | null;
  note: string | null;
  created_at: string;
}

export type InputFieldType = 'text' | 'choice' | 'boolean' | 'number';

export interface InputField {
  key: string;
  type: InputFieldType;
  label: string;
  required: boolean;
  choices?: string[];
}

export const MAX_INPUT_FIELDS = 8;

export type InputRequestStatus = 'pending' | 'answered' | 'dismissed' | 'expired';

export interface InputRequestEntity {
  id: string;
  workspace_id: string;
  inbox_item_id: string;
  agent_slug: string;
  source_id: string | null;
  run_id: string | null;
  upstream_request_id: string;
  question: string;
  fields: InputField[];
  /** User content: never logged, never audited. */
  answer: Record<string, unknown> | null;
  status: InputRequestStatus;
  version: number;
  claimed_by: string | null;
  claimed_at: string | null;
  answered_by: string | null;
  answered_at: string | null;
  resume_delivered_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A claim older than this is a crashed decision and is released by the expiry job. */
export const STALE_CLAIM_MS = 2 * 60_000;
/** The reminder goes out this long before an approval expires (FR-INBOX-12). */
export const REMINDER_LEAD_MS = 24 * 60 * 60_000;
