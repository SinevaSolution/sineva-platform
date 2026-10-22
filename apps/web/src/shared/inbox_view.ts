// JSON contract for the Inbox as the browser sees it (WP-M1-40). Client code
// may import this file but never `@/server/*`. A guard in
// `server/http/inbox_view_contract.ts` keeps the server types assignable.

export type InboxTabView = 'needs_review' | 'needs_input' | 'done';
export type InboxStateView = 'open' | 'resolved' | 'dismissed' | 'expired';

/** A catalog key plus structured params; the client localizes it. Never model text. */
export interface InboxSentenceView {
  key: string;
  params: Record<string, unknown>;
}

export interface InboxApprovalView {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  action_type: string;
  revision: number;
  /** Send this back with a decision so a stale screen cannot decide a changed draft. */
  version: number;
  awaiting_revision: boolean;
  risk_level: 'low' | 'medium' | 'high';
  requirement: 'guardrail' | 'policy';
  guardrail_reason: string | null;
  expires_at: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  /** Hidden from viewers. */
  decision_note?: string | null;
  /** Hidden from viewers. */
  change_request?: string | null;
}

export interface InboxInputFieldView {
  key: string;
  type: 'text' | 'choice' | 'boolean' | 'number';
  label: string;
  required: boolean;
  choices?: string[];
}

export interface InboxInputRequestView {
  id: string;
  status: 'pending' | 'answered' | 'dismissed' | 'expired';
  question: string;
  fields: InboxInputFieldView[];
  version: number;
  due_at: string | null;
  answered_at: string | null;
  /** Hidden from viewers. */
  answer?: Record<string, unknown> | null;
}

export interface InboxRevisionView {
  revision: number;
  payload_hash: string;
  created_by: 'specialist' | 'user';
  created_at: string;
  /** Hidden from viewers. */
  payload?: Record<string, unknown>;
}

export interface InboxItemView {
  id: string;
  kind: 'approval' | 'input_request' | 'result';
  tab: InboxTabView;
  state: InboxStateView;
  agent_slug: string | null;
  /** Producer text: render escaped. */
  title: string;
  summary: InboxSentenceView;
  source: { type: 'chat' | 'room' | 'system'; id: string | null };
  unread: boolean;
  expires_at: string | null;
  resolved_at: string | null;
  created_at: string;
  approval: InboxApprovalView | null;
  input_request: InboxInputRequestView | null;
  // Detail only. Absent for viewers, who see summaries, not draft bodies.
  payload?: Record<string, unknown>;
  editable_fields?: string[];
  approve_note_key?: string;
  revisions?: InboxRevisionView[];
}

export interface InboxListView {
  items: InboxItemView[];
  next_cursor: string | null;
}

export interface InboxCountsView {
  needs_review: number;
  needs_input: number;
  done: number;
  /** needs_review + needs_input: the rail badge (FR-INBOX-04). */
  badge: number;
  unread_needs_review: number;
  unread_needs_input: number;
}
