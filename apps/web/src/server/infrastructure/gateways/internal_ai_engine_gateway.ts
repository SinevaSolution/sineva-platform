import 'server-only';
import { z } from 'zod';
import {
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type {
  AiEngineChatRequest,
  AiEngineChatResponse,
  AiEngineGateway,
  AiEngineHealthResult,
} from '@/server/domain/repositories/ai_engine_gateway';
import { getEnvConfig } from '../config/env';

const INTERNAL_API_KEY_HEADER = 'X-Internal-Api-Key';
const HEALTH_TIMEOUT_MS = 1200;
// Enough to diagnose a failure from logs without dumping a whole page.
const LOGGED_BODY_MAX_CHARS = 500;

// Mirrors sineva-ai's ChatResponseDTO and its success envelope. The schema is
// not `.strict()`: unknown fields are dropped so sineva-ai can add fields
// without breaking the platform, while a missing or mistyped field still fails
// loudly. `z.string().datetime({ offset: true })` accepts both `Z` and
// `+00:00`, since the Python side may emit either.
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
  async dispatchAgentChat(
    payload: AiEngineChatRequest,
  ): Promise<AiEngineChatResponse> {
    const env = getEnvConfig();
    const startedAt = Date.now();
    const url = `${env.ai_engine_internal_url}/api/v1/agents/${encodeURIComponent(payload.agent_slug)}/chat`;

    // sineva-ai's ChatRequestDTO forbids unknown keys, so the body is built
    // field by field. `agent_slug` travels in the path only. `tenant_id` is
    // not sent: the public chat request carries no workspace yet and
    // sineva-ai applies its own default. JSON.stringify drops the undefined
    // optionals.
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
        headers['X-Request-Id'] = payload.request_id;
      }

      // The timer must outlive the body read: an LLM reply can stall after the
      // headers arrive, and the abort should cover that too.
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      status = response.status;
      rawBody = await response.text();
    } catch (error) {
      console.error('[ai-engine] chat request failed', {
        url,
        reason: error instanceof Error ? error.name : 'unknown',
        aborted: controller.signal.aborted,
      });
      throw new UpstreamUnavailableError();
    } finally {
      clearTimeout(timeout);
    }

    const debugUpstream = process.env.DEBUG_LOG_UPSTREAM_BODIES === 'true';

    if (status < 200 || status >= 300) {
      console.error('[ai-engine] chat returned non-2xx', {
        url,
        status,
        byte_length: rawBody.length,
        ...(debugUpstream ? { body: rawBody.slice(0, LOGGED_BODY_MAX_CHARS) } : {}),
      });
      throw new UpstreamServiceError();
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      console.error('[ai-engine] chat returned non-JSON body', {
        url,
        status,
        byte_length: rawBody.length,
        ...(debugUpstream ? { body: rawBody.slice(0, LOGGED_BODY_MAX_CHARS) } : {}),
      });
      throw new UpstreamServiceError();
    }

    const parsed = chatEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      console.error('[ai-engine] chat body failed contract validation', {
        url,
        status,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      throw new UpstreamServiceError();
    }

    return { ...parsed.data.data, latency_ms: Date.now() - startedAt };
  }

  async checkHealth(): Promise<AiEngineHealthResult> {
    const env = getEnvConfig();
    const startedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${env.ai_engine_internal_url}/api/v1/health`,
        {
          method: 'GET',
          headers: { [INTERNAL_API_KEY_HEADER]: env.ai_engine_internal_api_key },
          signal: controller.signal,
        },
      );

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
        // Fallback to 'unknown' if response body is non-JSON
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
}
