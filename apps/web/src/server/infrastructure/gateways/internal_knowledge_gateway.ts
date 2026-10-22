import 'server-only';
import crypto from 'node:crypto';
import type { z } from 'zod';
import { UpstreamServiceError, UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type {
  AclUpdateReport,
  AclUpdateRequest,
  DeleteReport,
  IngestAccepted,
  IngestRequest,
  IngestStatusSnapshot,
  KnowledgeCall,
  KnowledgeIngestGateway,
  ReindexRequest,
  SearchRequest,
  SearchResult,
  TextPreview,
  TextPreviewRequest,
} from '@/server/domain/library/knowledge_ingest_gateway';
import { getEnvConfig } from '../config/env';
import { logger, utf8ByteLength } from '../logging/logger';
import {
  aclUpdateReportSchema,
  deleteReportSchema,
  envelope,
  ingestAcceptedSchema,
  ingestStatusSchema,
  searchResultSchema,
  textPreviewSchema,
} from './knowledge_schemas';

// Platform side of the Library contract with sineva-ai (ADR-0030). Same failure
// model as the chat gateway (ADR-0016): unreachable or timed out is 503,
// anything else that is not a valid answer is 502. No retry and no stand-in
// data: a retry that hid the failure would make an unreadable document look
// pending forever, and the caller decides what an honest status is.

const SAFE_UPSTREAM_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

interface RequestOptions<S extends z.ZodTypeAny> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
  call: KnowledgeCall;
  schema: S;
}

function traceparent(): string {
  return `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`;
}

/** The machine code of an upstream error body, if it is a safe token. Upstream text is never copied. */
function upstreamCode(rawBody: string): string | undefined {
  try {
    const json = JSON.parse(rawBody);
    const code = json?.errors?.[0]?.code ?? json?.code;
    return typeof code === 'string' && SAFE_UPSTREAM_CODE.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

export class InternalKnowledgeGateway implements KnowledgeIngestGateway {
  private async request<S extends z.ZodTypeAny>(options: RequestOptions<S>): Promise<z.infer<S>> {
    const env = getEnvConfig();
    const url = new URL(`${env.ai_engine_internal_url}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      'X-Internal-Api-Key': env.ai_engine_internal_api_key,
      'X-Sineva-Context': options.call.context_token,
      'X-Request-Id': options.call.request_id ?? crypto.randomUUID(),
      traceparent: traceparent(),
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ai_engine_timeout_ms);
    let status: number;
    let rawBody: string;
    try {
      const response = await fetch(url.toString(), {
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
      throw new UpstreamUnavailableError('The Library reader is unavailable', 'KNOWLEDGE_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }

    if (status < 200 || status >= 300) {
      const code = upstreamCode(rawBody);
      logger.error('ai_engine.non_2xx', { status, byte_length: utf8ByteLength(rawBody), code });
      if (status === 503) {
        throw new UpstreamUnavailableError('The Library reader is unavailable', code ?? 'KNOWLEDGE_UNAVAILABLE');
      }
      throw new UpstreamServiceError('The Library reader rejected the request', code ?? 'UPSTREAM_ERROR', 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      logger.error('ai_engine.non_json', { status, byte_length: utf8ByteLength(rawBody) });
      throw new UpstreamServiceError('The Library reader returned an unexpected response');
    }
    const parsed = envelope(options.schema).safeParse(json);
    if (!parsed.success) {
      // Paths only: a Zod message can quote the offending value.
      logger.error('ai_engine.contract_violation', {
        status,
        issue_paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new UpstreamServiceError('The Library reader returned an unexpected response');
    }
    return parsed.data.data;
  }

  private mismatch(): UpstreamServiceError {
    logger.error('ai_engine.contract_violation', { issue_paths: ['data.document_id'] });
    return new UpstreamServiceError('The Library reader returned an unexpected response');
  }

  async requestIngest(request: IngestRequest, call: KnowledgeCall): Promise<IngestAccepted> {
    return this.request({
      method: 'POST',
      path: '/api/v1/knowledge/documents',
      body: request,
      call,
      schema: ingestAcceptedSchema,
    });
  }

  async getIngestStatus(jobId: string, tenantId: string, call: KnowledgeCall): Promise<IngestStatusSnapshot> {
    const status = await this.request({
      method: 'GET',
      path: `/api/v1/knowledge/ingest/${encodeURIComponent(jobId)}`,
      query: { tenant_id: tenantId },
      call,
      schema: ingestStatusSchema,
    });
    if (status.job_id !== jobId) {
      throw this.mismatch();
    }
    return status;
  }

  async requestReindex(request: ReindexRequest, call: KnowledgeCall): Promise<IngestAccepted> {
    return this.request({
      method: 'POST',
      path: `/api/v1/knowledge/documents/${encodeURIComponent(request.document_id)}/reindex`,
      body: request,
      call,
      schema: ingestAcceptedSchema,
    });
  }

  async updateAcl(request: AclUpdateRequest, call: KnowledgeCall): Promise<AclUpdateReport> {
    const report = await this.request({
      method: 'PUT',
      path: `/api/v1/knowledge/documents/${encodeURIComponent(request.document_id)}/acl`,
      body: request,
      call,
      schema: aclUpdateReportSchema,
    });
    if (report.document_id !== request.document_id) {
      throw this.mismatch();
    }
    return report;
  }

  async deleteDocument(tenantId: string, documentId: string, call: KnowledgeCall): Promise<DeleteReport> {
    const report = await this.request({
      method: 'DELETE',
      path: `/api/v1/knowledge/documents/${encodeURIComponent(documentId)}`,
      query: { tenant_id: tenantId },
      call,
      schema: deleteReportSchema,
    });
    // A report about another document must never count as proof for this one.
    if (report.document_id !== documentId) {
      throw this.mismatch();
    }
    return report;
  }

  async search(request: SearchRequest, call: KnowledgeCall): Promise<SearchResult> {
    return this.request({
      method: 'POST',
      path: '/api/v1/knowledge/search',
      body: request,
      call,
      schema: searchResultSchema,
    });
  }

  async getText(request: TextPreviewRequest, call: KnowledgeCall): Promise<TextPreview> {
    const preview = await this.request({
      method: 'GET',
      path: `/api/v1/knowledge/documents/${encodeURIComponent(request.document_id)}/text`,
      query: { tenant_id: request.tenant_id, page_from: request.page_from, page_to: request.page_to },
      call,
      schema: textPreviewSchema,
    });
    if (preview.document_id !== request.document_id) {
      throw this.mismatch();
    }
    return preview;
  }
}
