// ============================================================================
// Domain types for Contract v2 (WP-M0-28, FR-AIR-07, FR-AIR-08, FR-AIR-10)
// Pure TypeScript types without framework or outward dependencies
// ============================================================================

export type TerminalStatus =
  | 'completed'
  | 'needs_approval'
  | 'needs_input'
  | 'budget_exceeded'
  | 'failed';

export interface ChatTurnMention {
  agent_slug: string;
  start: number;
  end: number;
}

export interface ChatTurnAttachment {
  storage_key: string;
  filename: string;
  mime: string;
  size_bytes: number;
}

export interface ChatTurnRequestV2 {
  user_message: string;
  session_id?: string | null;
  client_message_id: string;
  mentions?: ChatTurnMention[];
  attachments?: ChatTurnAttachment[];
  use_library?: boolean;
  invoke_skill?: string | null;
  allow_degraded?: boolean;
}

export interface HandoffV2 {
  from_agent_slug: string;
  to_agent_slug: string;
  reason?: string;
}

export interface ModelInfoV2 {
  provider: string;
  model_id: string;
  execution_mode: string;
}

export interface UsageV2 {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ToolCallV2 {
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary?: string | null;
}

export interface CitationV2 {
  document_id: string;
  title: string;
  similarity_score: number;
  source_uri?: string | null;
  score_kind?: string;
}

export interface ChatTurnResultV2 {
  run_id: string;
  message_id: string;
  session_id: string;
  agent_slug: string;
  routed_agent_slug: string;
  handoffs: HandoffV2[];
  reply_content: string;
  reply_language: string;
  status: TerminalStatus;
  finish_reason?: string | null;
  model: ModelInfoV2;
  execution_mode: string;
  usage: UsageV2;
  tool_calls: ToolCallV2[];
  citations: CitationV2[];
  created_at: string;
}

export interface ParsedSseMessage {
  id?: string;
  event: string;
  data: unknown;
}
