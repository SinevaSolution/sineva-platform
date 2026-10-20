export interface AiEngineChatRequest {
  agent_slug: string;
  session_id: string;
  user_id: string;
  message_text: string;
  context_metadata?: Record<string, unknown>;
}

export interface AiEngineChatResponse {
  reply_id: string;
  agent_slug: string;
  session_id: string;
  reply_text: string;
  reasoning_summary: string;
  suggested_actions: string[];
  tokens_used: number;
  latency_ms: number;
  engine_source: 'sineva_ai_internal' | 'sineva_ai_fallback';
  created_at: string;
}

export interface AiEngineHealthResult {
  is_reachable: boolean;
  internal_url: string;
  latency_ms: number;
  engine_version: string;
}

export interface AiEngineGateway {
  dispatchAgentChat(
    payload: AiEngineChatRequest,
  ): Promise<AiEngineChatResponse>;
  checkHealth(): Promise<AiEngineHealthResult>;
}
