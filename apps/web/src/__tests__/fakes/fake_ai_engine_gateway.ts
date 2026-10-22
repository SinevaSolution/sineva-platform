import type {
  AiEngineChatRequest,
  AiEngineChatResponse,
  AiEngineGateway,
  AiEngineHealthResult,
  CancelRunResult,
  ChatTurnCallOptions,
  ResumeRunOptions,
  ResumeRunResult,
  RunEventsResult,
  SquadStreamCallOptions,
  StreamCallOptions,
} from '@/server/domain/repositories/ai_engine_gateway';
import type { ChatTurnResultV2 } from '@/server/application/dtos/chat_v2_dto';
import type { ParsedSseMessage } from '@/server/domain/chat/chat_v2';
import type { AgentCatalog, CatalogAgent } from '@/server/domain/specialists/agent_catalog';

/**
 * Deterministic gateway: never touches the network and records what it was
 * asked, so tests can assert on dispatch without the real adapter's HTTP
 * behaviour. Set `failure` to make the next calls throw, the way the real
 * adapter throws an upstream domain error.
 */
export class FakeAiEngineGateway implements AiEngineGateway {
  public readonly requests: AiEngineChatRequest[] = [];
  public readonly v2Requests: ChatTurnCallOptions[] = [];
  public readonly streamRequests: StreamCallOptions[] = [];
  public readonly squadStreamRequests: SquadStreamCallOptions[] = [];
  /** Body of the next squad stream; defaults to a one-token squad turn. */
  public squadStreamFactory: ((options: SquadStreamCallOptions) => Promise<ReadableStream<Uint8Array>>) | null = null;
  public readonly cancelRequests: Array<{ runId: string; contextToken?: string }> = [];
  public readonly replayRequests: Array<{ runId: string; afterSeq?: number }> = [];
  public failure: Error | null = null;
  /** What `listAgents` returns: sineva-ai's catalog, six live wave 1 entries plus `sino` and a coming soon one. */
  public catalog: AgentCatalog = buildCatalogFixture();
  public readonly catalogRequests: Array<{ requestId?: string }> = [];
  /** Replaces the default stream body (the text-only contract transcript). */
  public streamFactory: ((options: StreamCallOptions) => Promise<ReadableStream<Uint8Array>>) | null =
    null;
  /** What `getRunEvents` returns, filtered by `afterSeq` on numeric ids. */
  public runEvents: ParsedSseMessage[] = [];
  public readonly resumeRequests: ResumeRunOptions[] = [];
  /** Makes `resumeRun` throw without affecting the other calls (an unreachable sineva-ai). */
  public resumeFailure: Error | null = null;
  /** Makes `cancelRun` throw without affecting the other calls. */
  public cancelFailure: Error | null = null;
  public healthResult: AiEngineHealthResult = {
    is_reachable: true,
    internal_url: 'http://fake-ai-engine',
    latency_ms: 1,
    engine_version: '1.0.0',
  };

  async chatTurn(
    options: ChatTurnCallOptions,
  ): Promise<ChatTurnResultV2 & { latency_ms: number }> {
    this.v2Requests.push(options);
    if (this.failure) {
      throw this.failure;
    }
    return {
      run_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
      message_id: 'c2e8f1a4-0d93-4b6e-a7c5-5f1d3e9b8a60',
      session_id: options.request.session_id ?? '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      agent_slug: options.agentSlug,
      routed_agent_slug: options.agentSlug,
      handoffs: [],
      reply_content: `fake-engine reply to "${options.request.user_message}"`,
      reply_language: 'id',
      status: 'completed',
      finish_reason: 'stop',
      model: {
        provider: 'fake',
        model_id: 'fake:model',
        execution_mode: 'fake_runtime',
      },
      execution_mode: 'fake_runtime',
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      tool_calls: [],
      citations: [],
      created_at: '2026-10-01T00:00:00.000Z',
      latency_ms: 1,
    };
  }

  async chatStream(options: StreamCallOptions): Promise<ReadableStream<Uint8Array>> {
    this.streamRequests.push(options);
    if (this.failure) {
      throw this.failure;
    }
    if (this.streamFactory) {
      return this.streamFactory(options);
    }
    const encoder = new TextEncoder();
    // A contract-shaped transcript, so relay tests that do not care about the
    // content still run through the same `done` validation as production.
    const done = {
      run_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
      message_id: 'c2e8f1a4-0d93-4b6e-a7c5-5f1d3e9b8a60',
      session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      agent_slug: options.agentSlug,
      routed_agent_slug: options.agentSlug,
      handoffs: [],
      reply_content: 'fake stream reply',
      reply_language: 'en',
      status: 'completed',
      finish_reason: 'stop',
      model: { provider: 'fake', model_id: 'fake:model', execution_mode: 'fake_runtime' },
      execution_mode: 'fake_runtime',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      tool_calls: [],
      citations: [],
      created_at: '2026-10-01T00:00:00.000Z',
    };
    return new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`id: 1\nevent: token\ndata: {"token":"fake stream reply"}\n\n`),
        );
        controller.enqueue(encoder.encode(`id: 2\nevent: done\ndata: ${JSON.stringify(done)}\n\n`));
        controller.close();
      },
    });
  }

  async squadChatStream(options: SquadStreamCallOptions): Promise<ReadableStream<Uint8Array>> {
    this.squadStreamRequests.push(options);
    if (this.failure) {
      throw this.failure;
    }
    if (this.squadStreamFactory) {
      return this.squadStreamFactory(options);
    }
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`id: 1\nevent: token\ndata: {"token":"squad reply"}\n\n`));
        controller.close();
      },
    });
  }

  async listAgents(options: {
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<AgentCatalog> {
    this.catalogRequests.push({ requestId: options.requestId });
    if (this.failure) {
      throw this.failure;
    }
    return this.catalog;
  }

  async getRunEvents(options: {
    runId: string;
    afterSeq?: number;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<RunEventsResult> {
    this.replayRequests.push({ runId: options.runId, afterSeq: options.afterSeq });
    if (this.failure) {
      throw this.failure;
    }
    const after = options.afterSeq ?? 0;
    return {
      run_id: options.runId,
      events: this.runEvents.filter((e) => Number(e.id ?? 0) > after),
      has_more: false,
    };
  }

  async cancelRun(options: {
    runId: string;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<CancelRunResult> {
    this.cancelRequests.push({ runId: options.runId, contextToken: options.contextToken });
    if (this.cancelFailure) {
      throw this.cancelFailure;
    }
    if (this.failure) {
      throw this.failure;
    }
    return {
      run_id: options.runId,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    };
  }

  async resumeRun(options: ResumeRunOptions): Promise<ResumeRunResult> {
    this.resumeRequests.push(options);
    if (this.resumeFailure) {
      throw this.resumeFailure;
    }
    return { run_id: options.runId, status: 'resumed' };
  }

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

const WAVE_1_CATALOG: ReadonlyArray<Pick<CatalogAgent, 'agent_slug' | 'handle' | 'category'>> = [
  { agent_slug: 'sinopeople', handle: 'SinoPeople', category: 'people_hr' },
  { agent_slug: 'sinofinance', handle: 'SinoFinance', category: 'finance_ops' },
  { agent_slug: 'sinosales', handle: 'SinoSales', category: 'sales_growth' },
  { agent_slug: 'sinosocial', handle: 'SinoSocial', category: 'social_marketing' },
  { agent_slug: 'sinohelp', handle: 'SinoHelp', category: 'customer_support' },
  { agent_slug: 'sinoinsights', handle: 'SinoInsights', category: 'data_insights' },
];

/** A catalog shaped like the documented `GET /api/v2/agents` body, for tests that need no network. */
export function buildCatalogFixture(version = 'cat-test-1'): AgentCatalog {
  const agents: CatalogAgent[] = [
    { agent_slug: 'sino', handle: 'Sino', category: 'personal_ops', wave: 1, status: 'live' },
    ...WAVE_1_CATALOG.map((a) => ({ ...a, wave: 1, status: 'live' as const })),
    { agent_slug: 'sinodesk', handle: 'SinoDesk', category: 'personal_ops', wave: 2, status: 'coming_soon' },
  ];
  return { catalog_version: version, agents };
}
