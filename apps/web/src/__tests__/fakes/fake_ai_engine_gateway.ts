import type {
  AiEngineChatRequest,
  AiEngineChatResponse,
  AiEngineGateway,
  AiEngineHealthResult,
} from '@/server/domain/repositories/ai_engine_gateway';

/**
 * Deterministic gateway: never touches the network and records what it was
 * asked, so tests can assert on dispatch without the real adapter's HTTP
 * behaviour. Set `failure` to make the next calls throw, the way the real
 * adapter throws an upstream domain error.
 */
export class FakeAiEngineGateway implements AiEngineGateway {
  public readonly requests: AiEngineChatRequest[] = [];
  public failure: Error | null = null;
  public healthResult: AiEngineHealthResult = {
    is_reachable: true,
    internal_url: 'http://fake-ai-engine',
    latency_ms: 1,
    engine_version: '1.0.0',
  };

  async dispatchAgentChat(
    payload: AiEngineChatRequest,
  ): Promise<AiEngineChatResponse> {
    this.requests.push(payload);
    if (this.failure) {
      throw this.failure;
    }
    return {
      message_id: 'c2e8f1a4-0d93-4b6e-a7c5-5f1d3e9b8a60',
      session_id: payload.session_id ?? '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      agent_slug: payload.agent_slug,
      display_name: 'Fake Companion',
      handle: '@FakeCompanion',
      routed_agent_slug: payload.agent_slug,
      reply_content: `fake-engine reply to "${payload.message_text}"`,
      model_id: 'fake:model',
      execution_mode: 'fake_runtime',
      token_usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      tool_calls: [],
      citations: [],
      created_at: '2026-10-01T00:00:00.000Z',
      latency_ms: 1,
    };
  }

  async checkHealth(): Promise<AiEngineHealthResult> {
    return this.healthResult;
  }
}
