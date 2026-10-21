// JSON contract for a chat reply as the browser sees it (the `data` of
// `POST /api/v1/agents/{agent_slug}/chat`). Field names follow sineva-ai's chat
// response, which owns the shape; `latency_ms` is added by the platform.
// Client code may import this file but never `@/server/*`;
// `server/http/chat_view_contract.ts` fails the type-check if the domain
// response stops being assignable to this view.

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
