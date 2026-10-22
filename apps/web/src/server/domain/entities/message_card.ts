export type MessageCardValidationStatus = 'valid' | 'rejected';

export type MessageCardState =
  | 'drafting'
  | 'ready'
  | 'needs_review'
  | 'done'
  | 'failed'
  | 'disconnected'
  | 'cancelled'
  | 'expired';

export interface MessageCardEntity {
  id: string;
  message_id: string;
  conversation_id: string;
  workspace_id: string;
  run_id: string | null;
  call_id: string | null;
  /** Order of completion inside the message, starting at 0. */
  position: number;
  card_type: string;
  schema_version: number;
  state: MessageCardState;
  provider_slug: string | null;
  connection_id: string | null;
  approval_id: string | null;
  /** Validated card data. `{}` on a rejected card: it keeps the code only. */
  data: Record<string, unknown>;
  actions: unknown[];
  fallback_text: string | null;
  payload_hash: string | null;
  validation_status: MessageCardValidationStatus;
  /** The `card.rejected` code of a rejected card, else null. */
  rejected_code: string | null;
  search_text: string | null;
  version: number;
  data_expires_at: string | null;
  created_at: string;
  updated_at: string;
}
