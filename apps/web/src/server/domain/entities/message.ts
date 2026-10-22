export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'needs_approval'
  | 'needs_input'
  | 'budget_exceeded'
  // Stopped by the person; the text that was already streamed is kept.
  | 'cancelled'
  // The run broke after it started; `finish_reason` holds the typed code.
  | 'error';

export interface MentionEntity {
  agent_slug: string;
  display_name?: string;
  handle?: string;
}

export interface MessageEntity {
  id: string;
  conversation_id: string;
  role: MessageRole;
  agent_slug: string | null;
  content: string;
  mentions: MentionEntity[] | null;
  status: MessageStatus;
  finish_reason: string | null;
  run_id: string | null;
  channel: string | null;
  client_message_id: string | null;
  created_at: string;
  updated_at: string;
}
