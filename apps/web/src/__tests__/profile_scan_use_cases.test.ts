import { beforeEach, describe, expect, it } from 'vitest';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import {
  NotFoundError,
  RateLimitedError,
  UpstreamServiceError,
  UpstreamUnavailableError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import type { ScanResult } from '@/server/domain/onboarding/profile_scan';
import { RequestProfileScanUseCase } from '@/server/application/use-cases/onboarding/request_profile_scan_use_case';
import { GetProfileScanUseCase } from '@/server/application/use-cases/onboarding/get_profile_scan_use_case';
import { DeleteProfileScanUseCase } from '@/server/application/use-cases/onboarding/delete_profile_scan_use_case';
import { FakeWebsiteScanGateway, InMemoryProfileScanRepository } from './fakes/in_memory_onboarding';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const HOUR = 60 * 60 * 1000;

function ctx(workspace: string): RequestContext {
  return { user_id: USER, workspace_id: workspace, role: 'owner', session_id: 's1', request_id: 'req-1' };
}

const signer: ContextSigner = {
  mint: async () => ({ token: 'signed.context.token', claims: {} as never }),
};

function resultFor(scanId: string, overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    scan_id: scanId,
    status: 'succeeded',
    source_url: 'https://tokokopi.example/',
    final_url: 'https://tokokopi.example/',
    fetched_pages: 2,
    site_language: 'id',
    fields: {
      display_name: { value: 'Toko Kopi', source_url: 'https://tokokopi.example/', evidence_snippet: 'Selamat datang di Toko Kopi' },
    },
    offers: [{ name: 'Kopi Gayo', description: null, source_url: 'https://tokokopi.example/menu', evidence_snippet: 'Kopi Gayo 250g' }],
    policies: [],
    error_code: null,
    ...overrides,
  };
}

describe('website scan use cases (WP-M1-36, FR-ONB-09 to FR-ONB-13)', () => {
  let scans: InMemoryProfileScanRepository;
  let gateway: FakeWebsiteScanGateway;
  let audit: CountingAuditLogger;
  let clock: Date;
  let request: RequestProfileScanUseCase;
  let get: GetProfileScanUseCase;

  beforeEach(() => {
    scans = new InMemoryProfileScanRepository();
    gateway = new FakeWebsiteScanGateway();
    audit = new CountingAuditLogger();
    clock = new Date('2026-10-22T10:00:00.000Z');
    request = new RequestProfileScanUseCase({ scans, gateway, contextSigner: signer, audit, now: () => clock });
    get = new GetProfileScanUseCase({ scans, now: () => clock });
    gateway.next = null;
  });

  const run = (url = 'https://tokokopi.example/', workspace = WS_A) =>
    request.execute({ workspace_id: workspace, user_id: USER, input: { source_url: url }, context: ctx(workspace) });

  // The gateway echoes the record id, as sineva-ai is asked to.
  function answerWith(make: (scanId: string) => ScanResult) {
    const original = gateway.scan.bind(gateway);
    gateway.scan = async (call) => {
      gateway.next = make(call.scan_id);
      return original(call);
    };
  }

  describe('running a scan', () => {
    it('stores the suggestions on the scan record and audits request and completion with counts only', async () => {
      answerWith((id) => resultFor(id));
      const scan = await run();
      expect(scan.status).toBe('succeeded');
      expect(scan.result?.fields.display_name?.value).toBe('Toko Kopi');
      expect(scan.requested_by).toBe(USER);
      expect(audit.getEvents().map((e) => e.action)).toEqual(['profile.scan_requested', 'profile.scan_completed']);
      expect(JSON.stringify(audit.getEvents())).not.toContain('Selamat datang');
    });

    it('sends the validated URL, the locale, the record id and a signed context to sineva-ai', async () => {
      answerWith((id) => resultFor(id));
      await request.execute({ workspace_id: WS_A, user_id: USER, input: { source_url: ' https://TokoKopi.example/ ', locale: 'en' }, context: ctx(WS_A) });
      expect(gateway.calls).toHaveLength(1);
      expect(gateway.calls[0]).toMatchObject({
        source_url: 'https://tokokopi.example/',
        locale: 'en',
        contextToken: 'signed.context.token',
        scan_id: scans.rows[0].id,
      });
    });

    it('keeps a partial result as partial', async () => {
      answerWith((id) => resultFor(id, { status: 'partial', fields: {} }));
      expect((await run()).status).toBe('partial');
    });

    it('records a scan that ran but could not read the page as failed with its typed code, and does not throw', async () => {
      answerWith((id) => resultFor(id, { status: 'failed', fields: {}, offers: [], error_code: 'login_required' }));
      const scan = await run();
      expect(scan.status).toBe('failed');
      expect(scan.error_code).toBe('login_required');
      expect(audit.getEvents().at(-1)?.action).toBe('profile.scan_failed');
    });

    it('refuses a private target, an invalid link and a social page before anything is recorded or called', async () => {
      for (const url of ['http://169.254.169.254/latest/', 'not a url', 'https://www.instagram.com/tokokopi']) {
        await expect(run(url)).rejects.toThrow(ValidationError);
      }
      expect(scans.rows).toHaveLength(0);
      expect(gateway.calls).toHaveLength(0);
    });
  });

  describe('sineva-ai down or wrong: onboarding continues without scan results (ADR-0016)', () => {
    it('unreachable sineva-ai is a typed 503, recorded on the scan', async () => {
      gateway.next = new UpstreamUnavailableError();
      const error = await run().catch((e) => e);
      expect(error).toBeInstanceOf(UpstreamUnavailableError);
      expect(error.status).toBe(503);
      expect(error.code).toBe('scan_unavailable');
      expect(error.message).not.toContain('sineva-ai');
      expect(scans.rows[0]).toMatchObject({ status: 'failed', error_code: 'ai_engine_unavailable', result: null });
      expect(audit.getEvents().at(-1)?.action).toBe('profile.scan_failed');
    });

    it('a bad answer is a typed 502', async () => {
      gateway.next = new UpstreamServiceError('upstream said: secret internals');
      const error = await run().catch((e) => e);
      expect(error).toBeInstanceOf(UpstreamServiceError);
      expect(error.status).toBe(502);
      expect(error.code).toBe('scan_bad_response');
      expect(error.message).not.toContain('secret internals');
      expect(scans.rows[0]).toMatchObject({ status: 'failed', error_code: 'ai_engine_bad_response' });
    });

    it('an answer for a different scan id is rejected as a bad answer', async () => {
      gateway.next = resultFor('some-other-scan');
      await expect(run()).rejects.toThrow(UpstreamServiceError);
      expect(scans.rows[0].status).toBe('failed');
    });

    it('a scan that never reached sineva-ai does not burn the hourly quota', async () => {
      gateway.next = new UpstreamUnavailableError();
      for (let i = 0; i < 6; i += 1) await run().catch(() => undefined);
      expect(scans.rows).toHaveLength(6);
      answerWith((id) => resultFor(id));
      expect((await run()).status).toBe('succeeded');
    });
  });

  describe('rate limit: 5 scans per workspace per hour (FR-ONB-12)', () => {
    beforeEach(() => answerWith((id) => resultFor(id)));

    it('allows five and refuses the sixth with a 429 and a retry time, without calling sineva-ai', async () => {
      for (let i = 0; i < 5; i += 1) await run();
      const callsBefore = gateway.calls.length;
      const error = await run().catch((e) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.status).toBe(429);
      expect(error.retry_after_seconds).toBeGreaterThan(0);
      expect(error.retry_after_seconds).toBeLessThanOrEqual(3600);
      expect(gateway.calls.length).toBe(callsBefore);
    });

    it('counts per workspace, not per user or globally', async () => {
      for (let i = 0; i < 5; i += 1) await run('https://tokokopi.example/', WS_A);
      await expect(run('https://tokokopi.example/', WS_A)).rejects.toThrow(RateLimitedError);
      expect((await run('https://other.example/', WS_B)).status).toBe('succeeded');
    });

    it('lets scans through again once the hour has passed', async () => {
      for (let i = 0; i < 5; i += 1) await run();
      clock = new Date(clock.getTime() + HOUR + 1000);
      expect((await run()).status).toBe('succeeded');
    });

    it('deleting a scan does not reset the quota', async () => {
      const del = new DeleteProfileScanUseCase({ scans });
      for (let i = 0; i < 5; i += 1) {
        const scan = await run();
        await del.execute({ workspace_id: WS_A, scan_id: scan.id });
      }
      await expect(run()).rejects.toThrow(RateLimitedError);
    });
  });

  describe('read, expiry and delete', () => {
    beforeEach(() => answerWith((id) => resultFor(id)));

    it('reads a scan of the same workspace', async () => {
      const scan = await run();
      expect((await get.execute({ workspace_id: WS_A, scan_id: scan.id })).id).toBe(scan.id);
    });

    it('another workspace cannot read, or delete, the scan (cross-workspace is not found)', async () => {
      const scan = await run();
      await expect(get.execute({ workspace_id: WS_B, scan_id: scan.id })).rejects.toThrow(NotFoundError);
      await expect(new DeleteProfileScanUseCase({ scans }).execute({ workspace_id: WS_B, scan_id: scan.id })).rejects.toThrow(NotFoundError);
      expect((await get.execute({ workspace_id: WS_A, scan_id: scan.id })).id).toBe(scan.id);
    });

    it('results expire after 24 hours: still there at 23h59, gone at 24h, and blanked', async () => {
      const scan = await run();
      clock = new Date(clock.getTime() + 24 * HOUR - 60_000);
      expect((await get.execute({ workspace_id: WS_A, scan_id: scan.id })).result).not.toBeNull();
      clock = new Date(clock.getTime() + 60_000);
      await expect(get.execute({ workspace_id: WS_A, scan_id: scan.id })).rejects.toThrow(NotFoundError);
      expect(scans.rows[0].result).toBeNull();
    });

    it('the next request purges expired results of that workspace', async () => {
      await run();
      clock = new Date(clock.getTime() + 25 * HOUR);
      await run();
      expect(scans.rows[0].result).toBeNull();
      expect(scans.rows[1].result).not.toBeNull();
    });

    it('delete drops the suggestions: the scan then reads as not found', async () => {
      const scan = await run();
      await new DeleteProfileScanUseCase({ scans }).execute({ workspace_id: WS_A, scan_id: scan.id });
      await expect(get.execute({ workspace_id: WS_A, scan_id: scan.id })).rejects.toThrow(NotFoundError);
      expect(scans.rows[0].result).toBeNull();
    });

    it('a scan stuck running past the request time reads as failed, not as a spinner', async () => {
      const created = await scans.createIfUnderLimit({
        workspace_id: WS_A, requested_by: USER, url: 'https://tokokopi.example/', now: clock, limit: 5, window_ms: HOUR, ttl_ms: 24 * HOUR,
      });
      if (created.limited) throw new Error('unexpected');
      clock = new Date(clock.getTime() + 2 * 60_000);
      const stale = await get.execute({ workspace_id: WS_A, scan_id: created.scan.id });
      expect(stale).toMatchObject({ status: 'failed', error_code: 'scan_timeout' });
    });
  });
});
