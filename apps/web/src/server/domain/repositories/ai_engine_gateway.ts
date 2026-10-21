// The chat shapes below mirror what sineva-ai returns (sineva-ai owns that
// contract), so field names are sineva-ai's. `latency_ms` is the only field the
// platform adds: it is measured around the upstream call.

export interface AiEngineChatRequest {
  agent_slug: string;
  // Optional: sineva-ai creates a session when it is omitted.
  session_id?: string;
  user_id: string;
  message_text: string;
  context_metadata?: Record<string, unknown>;
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
  /**
   * @throws UpstreamServiceError when sineva-ai answers with a non-2xx status
   *   or a body that does not match its contract.
   * @throws UpstreamUnavailableError when sineva-ai cannot be reached.
   */
  dispatchAgentChat(
    payload: AiEngineChatRequest,
  ): Promise<AiEngineChatResponse>;
  checkHealth(): Promise<AiEngineHealthResult>;
}
