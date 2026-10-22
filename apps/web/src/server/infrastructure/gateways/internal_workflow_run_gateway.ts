import 'server-only';
import crypto from 'node:crypto';
import type { z } from 'zod';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type {
  ResumeMode,
  RunAccepted,
  RunSnapshot,
  StartRunRequest,
  WorkflowRunCall,
  WorkflowRunGateway,
} from '@/server/domain/workflows/workflow_ports';
import { getEnvConfig } from '../config/env';
import { logger, utf8ByteLength } from '../logging/logger';
import { envelope, runAcceptedSchema, runSnapshotSchema } from './workflow_run_schemas';

// Platform side of the Workflow run contract with sineva-ai (ADR-0046). Same
// failure model as the chat and Library gateways (ADR-0016): unreachable or
// timed out is 503, anything else that is not a valid answer is 502. No retry
// and no stand-in data: a retry would hide a failure the person must see, and a
// canned run would be a result nobody produced.

const SAFE_UPSTREAM_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

interface RequestOptions<S extends z.ZodTypeAny> {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  call: WorkflowRunCall;
  schema: S;
  idempotencyKey?: string;
}

function traceparent(): string {
  return `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`;
}

/** The machine code of an upstream error body, if it is a safe token. Upstream text is never copied. */
function upstreamCode(rawBody: string): string | undefined {
  try {
    const json = JSON.parse(rawBody);
    const found = json?.errors?.[0]?.code ?? json?.code;
    return typeof found === 'string' && SAFE_UPSTREAM_CODE.test(found) ? found : undefined;
  } catch {
    return undefined;
  }
}

export class InternalWorkflowRunGateway implements WorkflowRunGateway {
  private async request<S extends z.ZodTypeAny>(options: RequestOptions<S>): Promise<z.infer<S>> {
    const env = getEnvConfig();
    const url = `${env.ai_engine_internal_url}${options.path}`;
    const headers: Record<string, string> = {
      'X-Internal-Api-Key': env.ai_engine_internal_api_key,
      'X-Sineva-Context': options.call.context_token,
      'X-Request-Id': options.call.request_id ?? crypto.randomUUID(),
      traceparent: traceparent(),
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ai_engine_timeout_ms);
    let status: number;
    let rawBody: string;
    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
      status = response.status;
      rawBody = await response.text();
    } catch (error) {
      logger.error('ai_engine.request_failed', {
        reason: error instanceof Error ? error.name : 'unknown',
        aborted: controller.signal.aborted,
      });
      throw new UpstreamUnavailableError('The Workflow engine is unavailable', 'workflow_engine_unavailable');
    } finally {
      clearTimeout(timeout);
    }

    if (status < 200 || status >= 300) {
      const found = upstreamCode(rawBody);
      logger.error('ai_engine.non_2xx', { status, byte_length: utf8ByteLength(rawBody), code: found });
      if (status === 503) {
        throw new UpstreamUnavailableError('The Workflow engine is unavailable', found ?? 'workflow_engine_unavailable');
      }
      throw new UpstreamServiceError('The Workflow engine rejected the request', found ?? 'UPSTREAM_ERROR', 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      logger.error('ai_engine.non_json', { status, byte_length: utf8ByteLength(rawBody) });
      throw new UpstreamServiceError('The Workflow engine returned an unexpected response');
    }
    const parsed = envelope(options.schema).safeParse(json);
    if (!parsed.success) {
      // Paths only: a Zod message can quote the offending value.
      logger.error('ai_engine.contract_violation', {
        status,
        issue_paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new UpstreamServiceError('The Workflow engine returned an unexpected response');
    }
    return parsed.data.data;
  }

  /** An answer about another run must never count as an answer about this one. */
  private mismatch(): UpstreamServiceError {
    logger.error('ai_engine.contract_violation', { issue_paths: ['data.run_id'] });
    return new UpstreamServiceError('The Workflow engine returned an unexpected response');
  }

  async startRun(request: StartRunRequest, call: WorkflowRunCall): Promise<RunAccepted> {
    const accepted = await this.request({
      method: 'POST',
      path: '/api/v2/runs',
      body: request,
      call,
      schema: runAcceptedSchema,
      // The platform's own id doubles as the key: a retry of the same start is the same run.
      idempotencyKey: request.run_id,
    });
    if (accepted.run_id !== request.run_id) throw this.mismatch();
    return accepted;
  }

  async getRun(engineRunId: string, call: WorkflowRunCall): Promise<RunSnapshot> {
    const snapshot = await this.request({
      method: 'GET',
      path: `/api/v2/runs/${encodeURIComponent(engineRunId)}`,
      call,
      schema: runSnapshotSchema,
    });
    if (snapshot.run_id !== engineRunId) throw this.mismatch();
    return snapshot;
  }

  async cancelRun(engineRunId: string, call: WorkflowRunCall): Promise<RunAccepted> {
    const answer = await this.request({
      method: 'POST',
      path: `/api/v2/runs/${encodeURIComponent(engineRunId)}/cancel`,
      call,
      schema: runAcceptedSchema,
    });
    if (answer.run_id !== engineRunId) throw this.mismatch();
    return answer;
  }

  async resumeRun(
    engineRunId: string,
    body: { mode: ResumeMode },
    idempotencyKey: string,
    call: WorkflowRunCall,
  ): Promise<RunAccepted> {
    const answer = await this.request({
      method: 'POST',
      path: `/api/v2/runs/${encodeURIComponent(engineRunId)}/resume`,
      body,
      call,
      schema: runAcceptedSchema,
      idempotencyKey,
    });
    if (answer.run_id !== engineRunId) throw this.mismatch();
    return answer;
  }
}
