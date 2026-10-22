// JSON contract for chat, conversations, and messages as the browser sees it.
// Client code may import this file but never `@/server/*`.

export interface ChatToolCallView {
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary: string | null;
}

export interface ChatCitationView {
  document_id: string;
  title: string;
  similarity_score: number;
  source_uri: string | null;
}

export interface ChatReplyView {
  message_id: string;
  session_id: string;
  agent_slug: string;
  display_name: string;
  handle: string;
  routed_agent_slug: string;
  reply_content: string;
  model_id: string;
  execution_mode: string;
  token_usage: Record<string, number>;
  tool_calls: ChatToolCallView[];
  citations: ChatCitationView[];
  created_at: string;
  latency_ms: number;
}

export interface ConversationView {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: 'hub' | 'room';
  agent_slug: string | null;
  title: string | null;
  title_source: 'user' | 'auto' | 'first_message' | null;
  pinned_at: string | null;
  archived_at: string | null;
  origin_message_id: string | null;
  origin_channel: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MentionView {
  agent_slug: string;
  display_name?: string;
  handle?: string;
}

export interface MessageView {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  agent_slug: string | null;
  content: string;
  mentions: MentionView[] | null;
  status:
    | 'pending'
    | 'completed'
    | 'failed'
    | 'needs_approval'
    | 'needs_input'
    | 'budget_exceeded'
    | 'cancelled'
    | 'error';
  finish_reason: string | null;
  run_id: string | null;
  channel: string | null;
  client_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendMessageResultView {
  message_id: string;
  run_id: string;
  conversation_id: string;
  status: string;
}
