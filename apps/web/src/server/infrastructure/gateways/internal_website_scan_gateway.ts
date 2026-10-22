import 'server-only';
import crypto from 'node:crypto';
import {
  ContextInvalidError,
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import type { ScanResult } from '@/server/domain/onboarding/profile_scan';
import type { WebsiteScanCall, WebsiteScanGateway } from '@/server/domain/repositories/website_scan_gateway';
import { getEnvConfig } from '../config/env';
import { logger, utf8ByteLength } from '../logging/logger';
import { scanResultEnvelopeSchema } from './website_scan_schemas';

// sineva-ai caps a scan at 20 s (FR-ONB-10); the platform waits a little
// longer so the fetcher's own typed `timeout` answer wins the race.
const SCAN_TIMEOUT_MS = 25_000;

const SCAN_PATH = '/internal/v1/profile/scan';
const SAFE_UPSTREAM_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Adapter for the website scan in sineva-ai. Proposed contract, pending
 * sineva-ai (fixtures `scan_*.json`, ADR-0031): if their answer differs, this
 * file and `website_scan_schemas.ts` change and nothing above them does.
 *
 * Same failure model as the chat gateway (ADR-0016): unreachable, timed out or
 * 503 is `UpstreamUnavailableError`; any other non-2xx, a non-JSON body or an
 * answer that is not the contract is `UpstreamServiceError`. Upstream text is
 * logged by size and code only and never copied into an error.
 */
export class InternalWebsiteScanGateway implements WebsiteScanGateway {
  async scan(call: WebsiteScanCall): Promise<ScanResult> {
    const env = getEnvConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

    let status: number;
    let rawBody: string;
    try {
      const response = await fetch(`${env.ai_engine_internal_url}${SCAN_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': env.ai_engine_internal_api_key,
          'X-Sineva-Context': call.contextToken,
          'X-Request-Id': call.requestId ?? crypto.randomUUID(),
          traceparent: `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`,
        },
        // Identity is in the signed context, never in the body.
        body: JSON.stringify({ source_url: call.source_url, locale: call.locale, scan_id: call.scan_id }),
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
      this.rejectStatus(status, rawBody);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      logger.error('ai_engine.non_json', { status, byte_length: utf8ByteLength(rawBody) });
      throw new UpstreamServiceError();
    }

    const parsed = scanResultEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      // Paths only: a Zod message can quote the scraped value.
      logger.error('ai_engine.contract_violation', {
        status,
        issue_paths: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new UpstreamServiceError();
    }
    return parsed.data.data;
  }

  private rejectStatus(status: number, rawBody: string): never {
    let upstreamCode: unknown;
    try {
      const json = JSON.parse(rawBody);
      upstreamCode = json?.errors?.[0]?.code ?? json?.code ?? json?.error?.code;
    } catch {
      // Not JSON: classified by status alone.
    }
    const code = typeof upstreamCode === 'string' && SAFE_UPSTREAM_CODE.test(upstreamCode) ? upstreamCode : undefined;
    logger.error('ai_engine.non_2xx', { status, byte_length: utf8ByteLength(rawBody), code });

    if (code === 'context_invalid') {
      // The platform minted the context, so a rejection is the platform's fault.
      throw new ContextInvalidError();
    }
    if (status === 503 || status === 504) {
      throw new UpstreamUnavailableError();
    }
    throw new UpstreamServiceError(undefined, code ?? 'UPSTREAM_ERROR');
  }
}
