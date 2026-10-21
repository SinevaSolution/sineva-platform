import type {
  ChatTurnRequestV2,
  ChatTurnResultV2,
  ParsedSseMessage,
} from '@/server/domain/chat/chat_v2';

// Contract v2 Gateway Call Types (WP-M0-28, FR-AIR-05 to FR-AIR-09)
export interface ChatTurnCallOptions {
  agentSlug: string;
  request: ChatTurnRequestV2;
  contextToken: string;
  requestId?: string;
  traceparent?: string;
}

export interface StreamCallOptions {
  agentSlug: string;
  request: ChatTurnRequestV2;
  contextToken: string;
  requestId?: string;
  traceparent?: string;
}

export interface AgentListItem {
  agent_slug: string;
  display_name: string;
  description?: string;
  category?: string;
  status: string;
}

export interface RunEventsResult {
  run_id: string;
  events: ParsedSseMessage[];
  has_more: boolean;
}

export interface CancelRunResult {
  run_id: string;
  status: string;
  cancelled_at: string;
}

// Legacy Contract v1 shapes (retained for backward compatibility during transition)
export interface AiEngineChatRequest {
  agent_slug: string;
  session_id?: string;
  user_id: string;
  message_text: string;
  context_metadata?: Record<string, unknown>;
  request_id?: string;
}

export interface AiEngineToolCall {
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary: string | null;
}

export interface AiEngineCitation {
  document_id: string;
  title: string;
  similarity_score: number;
  source_uri: string | null;
}

export interface AiEngineChatResponse {
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
  tool_calls: AiEngineToolCall[];
  citations: AiEngineCitation[];
  created_at: string;
  latency_ms: number;
}

export interface AiEngineHealthResult {
  is_reachable: boolean;
  internal_url: string;
  latency_ms: number;
  engine_version: string;
}

export interface AiEngineGateway {
  // Contract v2 methods
  chatTurn(options: ChatTurnCallOptions): Promise<ChatTurnResultV2 & { latency_ms: number }>;
  chatStream(options: StreamCallOptions): Promise<ReadableStream<Uint8Array>>;
  listAgents(options: {
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<AgentListItem[]>;
  getRunEvents(options: {
    runId: string;
    afterSeq?: number;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<RunEventsResult>;
  cancelRun(options: {
    runId: string;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<CancelRunResult>;

  // Health probe
  checkHealth(): Promise<AiEngineHealthResult>;

  // Legacy v1 interface
  dispatchAgentChat(payload: AiEngineChatRequest): Promise<AiEngineChatResponse>;
}
