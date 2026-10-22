import type { RequestContext } from '@/server/domain/context/request_context';
import type {
  ApprovalEntity,
  InboxItemEntity,
  InboxSourceType,
  InputField,
  InputRequestEntity,
} from './inbox_item';

// The port other features call to put something in front of a person:
// approvals from runs, input requests, results, later mentions and Customer
// chats escalations. It is idempotent on `(workspace_id, dedupe_key)`, so a
// replayed stream or a producer retry never makes a second item.

interface NewInboxItemBase {
  workspace_id: string;
  /** The person it is for. Derived by the caller from server-side records, never from a request body. */
  recipient_user_id: string | null;
  agent_slug: string;
  /** One-line producer text. Untrusted: stored short and rendered escaped. */
  title: string;
  source: { type: InboxSourceType; id: string | null };
}

export interface NewApprovalItem extends NewInboxItemBase {
  kind: 'approval';
  approval: {
    upstream_approval_id: string;
    upstream_run_id: string | null;
    /** 1 for the first draft; a higher number answers a change request. */
    revision: number;
    action_type: string;
    payload: Record<string, unknown>;
    guardrail_reason: string | null;
    expires_at?: Date | null;
  };
}

export interface NewInputRequestItem extends NewInboxItemBase {
  kind: 'input_request';
  input: {
    upstream_request_id: string;
    upstream_run_id: string | null;
    question: string;
    fields: InputField[];
    expires_at?: Date | null;
  };
}

export interface NewResultItem extends NewInboxItemBase {
  kind: 'result';
  dedupe_key: string;
  summary_key: string;
  summary_params: Record<string, unknown>;
}

export type NewInboxItem = NewApprovalItem | NewInputRequestItem | NewResultItem;

export interface CreatedInboxItem {
  item: InboxItemEntity;
  approval: ApprovalEntity | null;
  input_request: InputRequestEntity | null;
  /** False when the call matched an existing item (idempotent replay). */
  created: boolean;
}

export interface InboxItemCreator {
  create(input: NewInboxItem, context: RequestContext): Promise<CreatedInboxItem>;
}
