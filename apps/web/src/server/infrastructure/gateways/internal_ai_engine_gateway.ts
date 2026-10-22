import 'server-only';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  ContextInvalidError,
  DependencyUnavailableError,
  ModelUnavailableError,
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type {
  AgentListItem,
  AiEngineChatRequest,
  AiEngineChatResponse,
  AiEngineGateway,
  AiEngineHealthResult,
  CancelRunResult,
  ChatTurnCallOptions,
  RunEventsResult,
  StreamCallOptions,
} from '@/server/domain/repositories/ai_engine_gateway';
import {
  chatTurnResultEnvelopeV2Schema,
  chatTurnResultV2Schema,
  parseSseTranscript,
} from './ai_engine_v2_schemas';
import type { ChatTurnResultV2 } from '@/server/domain/chat/chat_v2';
import { getEnvConfig } from '../config/env';
import { logger, utf8ByteLength } from '../logging/logger';

const INTERNAL_API_KEY_HEADER = 'X-Internal-Api-Key';
const SINEVA_CONTEXT_HEADER = 'X-Sineva-Context';
const REQUEST_ID_HEADER = 'X-Request-Id';

// Machine-code shape accepted from an upstream error body.
const SAFE_UPSTREAM_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const TRACEPARENT_HEADER = 'traceparent';

const HEALTH_TIMEOUT_MS = 1200;
const STANDARD_CALL_TIMEOUT_MS = 5000;

export function generateTraceparent(): string {
  const traceId = crypto.randomBytes(16).toString('hex');
  const spanId = crypto.randomBytes(8).toString('hex');
  return `00-${traceId}-${spanId}-01`;
}

// Legacy v1 schema
const citationSchema = z.object({
  document_id: z.string().uuid(),
  title: z.string(),
  similarity_score: z.number(),
  source_uri: z.string().nullable(),
});

const toolCallSchema = z.object({
  tool_name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  result_summary: z.string().nullable(),
});

const chatDataSchema = z.object({
  message_id: z.string().uuid(),
  session_id: z.string().uuid(),
  agent_slug: z.string(),
  display_name: z.string(),
  handle: z.string(),
  routed_agent_slug: z.string(),
  reply_content: z.string(),
  model_id: z.string(),
  execution_mode: z.string(),
  token_usage: z.record(z.string(), z.number()),
  tool_calls: z.array(toolCallSchema),
  citations: z.array(citationSchema),
  created_at: z.string().datetime({ offset: true }),
});

const chatEnvelopeSchema = z.object({
  success: z.literal(true),
  data: chatDataSchema,
});

export class InternalAiEngineGateway implements AiEngineGateway {
  /**
   * Contract v2 Chat Turn (WP-M0-28, FR-AIR-07, FR-AIR-08)
   */
  async chatTurn(
    options: ChatTurnCallOptions,
  ): Promise<ChatTurnResultV2 & { latency_ms: number }> {
    const env = getEnvConfig();
    const startedAt = Date.now();
    const url = `${env.ai_engine_internal_url}/api/v2/agents/${encodeURIComponent(options.agentSlug)}/chat`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ai_engine_timeout_ms);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key,
      [SINEVA_CONTEXT_HEADER]: options.contextToken,
      [TRACEPARENT_HEADER]: options.traceparent || generateTraceparent(),
      [REQUEST_ID_HEADER]: options.requestId || crypto.randomUUID(),
    };

    let status: number;
    let rawBody: string;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(options.request),
        signal: controller.signal,
      });
      status = response.status;
      rawBody = await response.text();
    } catch (error) {
      logger.error('ai_engine.request_failed', {
        reason: error instanceof Error ? error.name : 'unknown',
        aborted: controller.signal.aborted,
      });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }

    if (status < 200 || status >= 300) {
      this.handleUpstreamError(status, rawBody);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      logger.error('ai_engine.non_json', {
        status,
        byte_length: utf8ByteLength(rawBody),
      });
      throw new UpstreamServiceError();
    }

    // Try envelope first, then direct
    const envelopeParsed = chatTurnResultEnvelopeV2Schema.safeParse(json);
    if (envelopeParsed.success) {
      return {
        ...envelopeParsed.data.data,
        latency_ms: Date.now() - startedAt,
      };
    }

    const directParsed = chatTurnResultV2Schema.safeParse(json);
    if (directParsed.success) {
      return {
        ...directParsed.data,
        latency_ms: Date.now() - startedAt,
      };
    }

    logger.error('ai_engine.contract_violation', {
      status,
      byte_length: utf8ByteLength(rawBody),
    });
    throw new UpstreamServiceError();
  }

  /**
   * Contract v2 SSE Stream (WP-M0-28, FR-AIR-10)
   */
  async chatStream(options: StreamCallOptions): Promise<ReadableStream<Uint8Array>> {
    const env = getEnvConfig();
    const url = `${env.ai_engine_internal_url}/api/v2/agents/${encodeURIComponent(options.agentSlug)}/chat/stream`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ai_engine_timeout_ms);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key,
      [SINEVA_CONTEXT_HEADER]: options.contextToken,
      [TRACEPARENT_HEADER]: options.traceparent || generateTraceparent(),
      [REQUEST_ID_HEADER]: options.requestId || crypto.randomUUID(),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(options.request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const rawBody = await response.text();
        this.handleUpstreamError(response.status, rawBody);
      }

      if (!response.body) {
        throw new UpstreamServiceError('Stream body is empty');
      }

      return response.body;
    } catch (error) {
      if (
        error instanceof UpstreamServiceError ||
        error instanceof UpstreamUnavailableError ||
        error instanceof ModelUnavailableError ||
        error instanceof DependencyUnavailableError ||
        error instanceof ContextInvalidError
      ) {
        throw error;
      }
      logger.error('ai_engine.request_failed', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Lists available agents from sineva-ai
   */
  async listAgents(options: {
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<AgentListItem[]> {
    const env = getEnvConfig();
    const url = `${env.ai_engine_internal_url}/api/v2/agents`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STANDARD_CALL_TIMEOUT_MS);

    const headers: Record<string, string> = {
      [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key,
      [TRACEPARENT_HEADER]: options.traceparent || generateTraceparent(),
      [REQUEST_ID_HEADER]: options.requestId || crypto.randomUUID(),
    };
    if (options.contextToken) {
      headers[SINEVA_CONTEXT_HEADER] = options.contextToken;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        this.handleUpstreamError(response.status, rawBody);
      }

      const json = JSON.parse(rawBody);
      const items = Array.isArray(json) ? json : json?.data || [];
      return items as AgentListItem[];
    } catch (error) {
      if (
        error instanceof UpstreamServiceError ||
        error instanceof UpstreamUnavailableError ||
        error instanceof ModelUnavailableError ||
        error instanceof DependencyUnavailableError ||
        error instanceof ContextInvalidError
      ) {
        throw error;
      }
      logger.error('ai_engine.request_failed', { reason: 'listAgents' });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Retrieves events for a run (replay)
   */
  async getRunEvents(options: {
    runId: string;
    afterSeq?: number;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<RunEventsResult> {
    const env = getEnvConfig();
    const query = options.afterSeq !== undefined ? `?after=${options.afterSeq}` : '';
    const url = `${env.ai_engine_internal_url}/api/v2/runs/${encodeURIComponent(options.runId)}/events${query}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STANDARD_CALL_TIMEOUT_MS);

    const headers: Record<string, string> = {
      [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key,
      [TRACEPARENT_HEADER]: options.traceparent || generateTraceparent(),
      [REQUEST_ID_HEADER]: options.requestId || crypto.randomUUID(),
    };
    if (options.contextToken) {
      headers[SINEVA_CONTEXT_HEADER] = options.contextToken;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        this.handleUpstreamError(response.status, rawBody);
      }

      const events = parseSseTranscript(rawBody);
      return {
        run_id: options.runId,
        events,
        has_more: false,
      };
    } catch (error) {
      if (
        error instanceof UpstreamServiceError ||
        error instanceof UpstreamUnavailableError ||
        error instanceof ModelUnavailableError ||
        error instanceof DependencyUnavailableError ||
        error instanceof ContextInvalidError
      ) {
        throw error;
      }
      logger.error('ai_engine.request_failed', { reason: 'getRunEvents' });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Cancels a running agent task
   */
  async cancelRun(options: {
    runId: string;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<CancelRunResult> {
    const env = getEnvConfig();
    const url = `${env.ai_engine_internal_url}/api/v2/runs/${encodeURIComponent(options.runId)}/cancel`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STANDARD_CALL_TIMEOUT_MS);

    const headers: Record<string, string> = {
      [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key,
      [TRACEPARENT_HEADER]: options.traceparent || generateTraceparent(),
      [REQUEST_ID_HEADER]: options.requestId || crypto.randomUUID(),
    };
    if (options.contextToken) {
      headers[SINEVA_CONTEXT_HEADER] = options.contextToken;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        this.handleUpstreamError(response.status, rawBody);
      }

      const json = JSON.parse(rawBody);
      return {
        run_id: options.runId,
        status: json?.status || 'cancelled',
        cancelled_at: json?.cancelled_at || new Date().toISOString(),
      };
    } catch (error) {
      if (
        error instanceof UpstreamServiceError ||
        error instanceof UpstreamUnavailableError ||
        error instanceof ModelUnavailableError ||
        error instanceof DependencyUnavailableError ||
        error instanceof ContextInvalidError
      ) {
        throw error;
      }
      logger.error('ai_engine.request_failed', { reason: 'cancelRun' });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Health check for internal AI engine
   */
  async checkHealth(): Promise<AiEngineHealthResult> {
    const env = getEnvConfig();
    const startedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`${env.ai_engine_internal_url}/api/v1/health`, {
        method: 'GET',
        headers: { [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key },
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          is_reachable: false,
          internal_url: env.ai_engine_internal_url,
          latency_ms: Math.max(1, Date.now() - startedAt),
          engine_version: 'standby',
        };
      }

      let engineVersion = 'unknown';
      try {
        const json = await response.json();
        if (typeof json?.data?.version === 'string') {
          engineVersion = json.data.version;
        } else if (typeof json?.version === 'string') {
          engineVersion = json.version;
        }
      } catch {
        // Fallback to 'unknown' if non-JSON
      }

      return {
        is_reachable: true,
        internal_url: env.ai_engine_internal_url,
        latency_ms: Math.max(1, Date.now() - startedAt),
        engine_version: engineVersion,
      };
    } catch {
      return {
        is_reachable: false,
        internal_url: env.ai_engine_internal_url,
        latency_ms: Math.max(1, Date.now() - startedAt),
        engine_version: 'standby',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Legacy Contract v1 dispatchAgentChat (retained for backward compatibility)
   */
  async dispatchAgentChat(payload: AiEngineChatRequest): Promise<AiEngineChatResponse> {
    const env = getEnvConfig();
    const startedAt = Date.now();
    const url = `${env.ai_engine_internal_url}/api/v1/agents/${encodeURIComponent(payload.agent_slug)}/chat`;

    const body = JSON.stringify({
      user_message: payload.message_text,
      session_id: payload.session_id,
      user_id: payload.user_id,
      context_metadata: payload.context_metadata,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ai_engine_timeout_ms);

    let status: number;
    let rawBody: string;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key,
      };
      if (payload.request_id) {
        headers[REQUEST_ID_HEADER] = payload.request_id;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      status = response.status;
      rawBody = await response.text();
    } catch (error) {
      logger.error('ai_engine.request_failed', {
        agent_slug: payload.agent_slug,
        reason: error instanceof Error ? error.name : 'unknown',
        aborted: controller.signal.aborted,
        latency_ms: Date.now() - startedAt,
      });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }

    if (status < 200 || status >= 300) {
      this.handleUpstreamError(status, rawBody);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      logger.error('ai_engine.non_json', {
        agent_slug: payload.agent_slug,
        status,
        byte_length: utf8ByteLength(rawBody),
        latency_ms: Date.now() - startedAt,
      });
      throw new UpstreamServiceError();
    }

    const parsed = chatEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      // Paths only. Zod messages can quote the offending value, and that
      // value is model or user content.
      logger.error('ai_engine.contract_violation', {
        agent_slug: payload.agent_slug,
        status,
        issue_paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new UpstreamServiceError();
    }

    return { ...parsed.data.data, latency_ms: Date.now() - startedAt };
  }

  /**
   * Maps upstream 4xx and 5xx to typed platform errors (WP-M0-28, ADR-0016, SEC-6)
   * Enforces log hygiene: never logs prompt, reply, or tool call payloads.
   */
  private handleUpstreamError(status: number, rawBody: string): never {
    let upstreamCode: string | undefined;
    // Used to classify only. Upstream text can echo user content or internals, so
    // it is never copied into a thrown error: those messages reach the client.
    let upstreamMessage: string | undefined;

    try {
      const json = JSON.parse(rawBody);
      upstreamCode = json?.errors?.[0]?.code || json?.code || json?.error?.code;
      upstreamMessage = json?.errors?.[0]?.detail || json?.message || json?.error?.message;
    } catch {
      // Body not JSON
    }

    // Only a machine token may travel to the client; anything else is dropped.
    const code =
      typeof upstreamCode === 'string' && SAFE_UPSTREAM_CODE.test(upstreamCode)
        ? upstreamCode
        : undefined;
    const lowered = typeof upstreamMessage === 'string' ? upstreamMessage.toLowerCase() : '';

    logger.error('ai_engine.non_2xx', {
      status,
      byte_length: utf8ByteLength(rawBody),
      code,
    });

    // Upstream context rejection -> internal error 500 (since platform minted it)
    if (status === 401 || status === 403 || code === 'context_invalid') {
      if (
        code === 'context_invalid' ||
        lowered.includes('context') ||
        lowered.includes('signature')
      ) {
        throw new ContextInvalidError();
      }
      throw new UpstreamServiceError('The AI engine rejected the request', code, 502);
    }

    // Upstream unavailable / model overloaded
    if (status === 503 || code === 'model_unavailable') {
      if (code === 'model_unavailable' || lowered.includes('model')) {
        throw new ModelUnavailableError();
      }
      if (code === 'dependency_unavailable') {
        throw new DependencyUnavailableError();
      }
      throw new UpstreamUnavailableError(undefined, code);
    }

    // Generic upstream service error 502
    throw new UpstreamServiceError(undefined, code || 'UPSTREAM_ERROR');
  }
}
