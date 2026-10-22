import type {
  ApprovalDecision,
  ApprovalEntity,
  ApprovalRevisionEntity,
  ApprovalStatus,
  InboxItemEntity,
  InboxItemKind,
  InboxListTab,
  InputField,
  InputRequestEntity,
  InputRequestStatus,
  InboxSourceType,
} from '../inbox/inbox_item';

export interface InboxBundle {
  item: InboxItemEntity;
  approval: ApprovalEntity | null;
  input_request: InputRequestEntity | null;
}

export interface NewApprovalRecord {
  workspace_id: string;
  recipient_user_id: string | null;
  agent_slug: string;
  title: string;
  summary_key: string;
  summary_params: Record<string, unknown>;
  source_type: InboxSourceType;
  source_id: string | null;
  dedupe_key: string;
  expires_at: Date;
  upstream_approval_id: string;
  upstream_run_id: string | null;
  action_type: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  risk_level: 'low' | 'medium' | 'high';
  requirement: 'guardrail' | 'policy';
  guardrail_reason: string | null;
}

export interface NewInputRecord {
  workspace_id: string;
  recipient_user_id: string | null;
  agent_slug: string;
  title: string;
  summary_key: string;
  summary_params: Record<string, unknown>;
  source_type: InboxSourceType;
  source_id: string | null;
  dedupe_key: string;
  due_at: Date | null;
  upstream_request_id: string;
  upstream_run_id: string | null;
  question: string;
  fields: InputField[];
}

export interface NewResultRecord {
  workspace_id: string;
  recipient_user_id: string | null;
  agent_slug: string;
  title: string;
  summary_key: string;
  summary_params: Record<string, unknown>;
  source_type: InboxSourceType;
  source_id: string | null;
  dedupe_key: string;
}

export interface InboxListQuery {
  workspace_id: string;
  tab?: InboxListTab;
  agent_slug?: string;
  kind?: InboxItemKind;
  source_type?: InboxSourceType;
  /** Case-insensitive part of the title. */
  q?: string;
  /** Member scope: only items addressed to this person. Owner and admin leave it unset. */
  recipient_user_id?: string;
  limit: number;
  cursor?: string | null;
}

export interface InboxListResult {
  items: InboxItemEntity[];
  next_cursor: string | null;
}

export interface InboxCounts {
  needs_review: number;
  needs_input: number;
  /** Results (news). Not part of Done, see ADR-0034. */
  updates: number;
  done: number;
  /** Open items this user has not opened yet. */
  unread_needs_review: number;
  unread_needs_input: number;
  unread_updates: number;
}

export interface ClaimInput {
  expected_version: number;
  user_id: string;
  decision: ApprovalDecision;
}

export interface CommitApprovalInput {
  expected_version: number;
  user_id: string;
  /** `pending` for ask-for-changes: the approval stays open and waits for a revision. */
  status: Extract<ApprovalStatus, 'approved' | 'rejected' | 'pending'>;
  note: string | null;
  change_request?: string | null;
  edited?: { payload: Record<string, unknown>; payload_hash: string };
  now: Date;
}

export interface AppendRevisionInput {
  expected_revision: number;
  payload: Record<string, unknown>;
  payload_hash: string;
  title: string;
  guardrail_reason: string | null;
  expires_at: Date;
  summary_params: Record<string, unknown>;
}

export interface CommitInputInput {
  expected_version: number;
  user_id: string;
  status: Extract<InputRequestStatus, 'answered' | 'dismissed'>;
  answer: Record<string, unknown> | null;
  now: Date;
}

export interface ExpirableRows {
  approvals: ApprovalEntity[];
  input_requests: InputRequestEntity[];
}

/**
 * Persistence for the Inbox (ADR-0032). Every read and write takes a
 * workspace or an id that was already resolved inside one; there is no
 * unscoped list. The three conditional writers (`claim*`, `commit*`,
 * `expire*`) return whether this call won, and the use cases build their
 * first-writer-wins guarantees on that return value.
 */
export interface InboxRepository {
  // Creation. Each returns the existing bundle with `created: false` when the dedupe key matches.
  createApprovalItem(input: NewApprovalRecord): Promise<{ bundle: InboxBundle; created: boolean }>;
  createInputItem(input: NewInputRecord): Promise<{ bundle: InboxBundle; created: boolean }>;
  createResultItem(input: NewResultRecord): Promise<{ bundle: InboxBundle; created: boolean }>;

  /**
   * Appends a specialist revision to an approval that is waiting for one.
   * False when the approval is not pending and awaiting a revision at
   * `expected_revision`.
   */
  appendRevision(approvalId: string, input: AppendRevisionInput): Promise<boolean>;
  listRevisions(approvalId: string): Promise<ApprovalRevisionEntity[]>;

  // Reads
  findBundle(workspaceId: string, itemId: string): Promise<InboxBundle | null>;
  findApproval(workspaceId: string, approvalId: string): Promise<ApprovalEntity | null>;
  findApprovalByUpstreamId(workspaceId: string, upstreamApprovalId: string): Promise<ApprovalEntity | null>;
  list(query: InboxListQuery): Promise<InboxListResult>;
  counts(workspaceId: string, userId: string, recipientUserId?: string): Promise<InboxCounts>;

  // Reads (per user)
  markRead(workspaceId: string, itemId: string, userId: string, now: Date): Promise<void>;
  readItemIds(userId: string, itemIds: string[]): Promise<Set<string>>;

  // Approval decision protocol
  claimApproval(approvalId: string, input: ClaimInput, now: Date): Promise<boolean>;
  releaseApproval(approvalId: string, userId: string): Promise<void>;
  commitApproval(approvalId: string, input: CommitApprovalInput): Promise<boolean>;

  // Input request protocol
  findInputRequest(workspaceId: string, inputRequestId: string): Promise<InputRequestEntity | null>;
  claimInputRequest(inputRequestId: string, input: { expected_version: number; user_id: string }, now: Date): Promise<boolean>;
  releaseInputRequest(inputRequestId: string, userId: string): Promise<void>;
  commitInputRequest(inputRequestId: string, input: CommitInputInput): Promise<boolean>;

  // Expiry job
  listExpirable(now: Date, limit: number): Promise<ExpirableRows>;
  expireApproval(approvalId: string, now: Date): Promise<boolean>;
  expireInputRequest(inputRequestId: string, now: Date): Promise<boolean>;
  listUndeliveredExpired(limit: number): Promise<ExpirableRows>;
  markResumeDelivered(target: 'approval' | 'input_request', id: string, at: Date): Promise<void>;
  releaseStaleClaims(olderThan: Date): Promise<number>;
  listReminderDue(now: Date, leadMs: number, limit: number): Promise<ApprovalEntity[]>;
}
