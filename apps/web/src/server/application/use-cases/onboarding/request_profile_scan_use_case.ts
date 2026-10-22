import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import type { RequestContext } from '@/server/domain/context/request_context';
import {
  DomainError,
  NotFoundError,
  RateLimitedError,
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import { validateScanUrl } from '@/server/domain/onboarding/scan_url';
import {
  SCAN_RATE_LIMIT,
  SCAN_RATE_WINDOW_MS,
  SCAN_RESULT_TTL_MS,
  type PlatformScanErrorCode,
  type ProfileScanEntity,
  type ScanResult,
} from '@/server/domain/onboarding/profile_scan';
import type { ProfileScanRepository } from '@/server/domain/repositories/onboarding_repositories';
import type { WebsiteScanGateway } from '@/server/domain/repositories/website_scan_gateway';
import type { ScanRequestDto } from '@/server/application/dtos/onboarding_dto';

export class RequestProfileScanUseCase {
  constructor(
    private readonly deps: {
      scans: ProfileScanRepository;
      gateway: WebsiteScanGateway;
      contextSigner: ContextSigner;
      audit: AuditLogger;
      now: () => Date;
    },
  ) {}

  /**
   * Reads one public page through sineva-ai and stores the suggestions (never
   * as profile fields: only a later confirm writes those). The record exists
   * before the call so the quota counts it and a failure leaves evidence.
   *
   * Failure model (ADR-0016): unreachable sineva-ai is a typed 503 and a bad
   * answer a typed 502, both recorded on the scan; a scan that ran but could
   * not read the page is a normal `failed` scan with a typed `error_code`.
   * Either way onboarding goes on without scan results.
   */
  async execute(input: {
    workspace_id: string;
    user_id: string;
    input: ScanRequestDto;
    context: RequestContext;
  }): Promise<ProfileScanEntity> {
    const { scans, gateway, contextSigner, audit, now } = this.deps;

    // First, and with no record or upstream call: a refused URL costs no quota.
    const url = validateScanUrl(input.input.source_url);
    const startedAt = now();

    // Expired suggestions are scraped third-party text: do not keep them around.
    await scans.purgeExpired(input.workspace_id, startedAt);

    const created = await scans.createIfUnderLimit({
      workspace_id: input.workspace_id,
      requested_by: input.user_id,
      url,
      now: startedAt,
      limit: SCAN_RATE_LIMIT,
      window_ms: SCAN_RATE_WINDOW_MS,
      ttl_ms: SCAN_RESULT_TTL_MS,
    });
    if (created.limited) {
      throw new RateLimitedError(
        'You have started too many website scans. Try again later.',
        created.retry_after_seconds,
        'scan_rate_limited',
      );
    }
    const scan = created.scan;

    await audit.log({
      action: 'profile.scan_requested',
      context: input.context,
      workspace_id: input.workspace_id,
      target_resource_id: scan.id,
      target_resource_type: 'profile_scan',
      metadata: { scan_id: scan.id },
    });

    let result: ScanResult;
    try {
      const { token } = await contextSigner.mint(input.context, { locale: input.input.locale ?? 'id' });
      result = await gateway.scan({
        source_url: url,
        locale: input.input.locale ?? 'id',
        scan_id: scan.id,
        contextToken: token,
        requestId: input.context.request_id,
      });
      if (result.scan_id !== scan.id) {
        // An answer for some other scan is not an answer to this one.
        throw new UpstreamServiceError('The website reader returned an unexpected answer');
      }
    } catch (error) {
      await this.fail(input, scan, error);
      throw this.typed(error);
    }

    const failed = result.status === 'failed';
    const recorded = await scans.recordOutcome(input.workspace_id, scan.id, {
      status: result.status,
      result,
      error_code: failed ? (result.error_code ?? 'extraction_failed') : null,
    });
    if (!recorded) {
      // Deleted while the call was in flight: the person discarded it.
      throw new NotFoundError('Profile scan', scan.id);
    }
    await audit.log({
      action: failed ? 'profile.scan_failed' : 'profile.scan_completed',
      context: input.context,
      workspace_id: input.workspace_id,
      target_resource_id: scan.id,
      target_resource_type: 'profile_scan',
      // Counts and codes only: scraped text never enters the audit log.
      metadata: failed
        ? { scan_id: scan.id, error_code: recorded.error_code }
        : { scan_id: scan.id, status: result.status, offers: result.offers.length, policies: result.policies.length },
    });
    return recorded;
  }

  private codeFor(error: unknown): PlatformScanErrorCode {
    return error instanceof UpstreamUnavailableError ? 'ai_engine_unavailable' : 'ai_engine_bad_response';
  }

  private async fail(
    input: { workspace_id: string; context: RequestContext },
    scan: ProfileScanEntity,
    error: unknown,
  ): Promise<void> {
    const code = this.codeFor(error);
    await this.deps.scans.recordOutcome(input.workspace_id, scan.id, { status: 'failed', result: null, error_code: code });
    await this.deps.audit.log({
      action: 'profile.scan_failed',
      context: input.context,
      workspace_id: input.workspace_id,
      target_resource_id: scan.id,
      target_resource_type: 'profile_scan',
      metadata: { scan_id: scan.id, error_code: code },
    });
  }

  // Messages here reach the client; upstream text never does.
  private typed(error: unknown): unknown {
    if (error instanceof UpstreamUnavailableError) {
      return new UpstreamUnavailableError(
        'The website reader is unavailable. You can continue without it.',
        'scan_unavailable',
      );
    }
    if (error instanceof DomainError) {
      return new UpstreamServiceError('The website reader returned an unexpected answer', 'scan_bad_response');
    }
    return error;
  }
}
