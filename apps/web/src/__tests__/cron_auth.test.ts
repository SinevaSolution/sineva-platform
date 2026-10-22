import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getApiExpire, POST as postApiExpire } from '@/app/api/internal/v1/inbox/expire/route';
import { GET as getExpire, POST as postExpire } from '@/app/internal/v1/inbox/expire/route';
import { POST as postApprovals } from '@/app/internal/v1/approvals/route';
import { GET as getApiTick, POST as postApiTick } from '@/app/api/internal/v1/jobs/tick/route';
import { GET as getStats } from '@/app/internal/v1/jobs/stats/route';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';
import { validateEnvConfig } from '@/server/infrastructure/config/env';
import { verifyCronBearer, verifyInternalJobCaller } from '@/server/http/internal_guard';

const KEY = 'test-secret-key-primary';
const CRON = 'cron-secret-0123456789abcdef';

function req(method: string, headers: Record<string, string> = {}, path = '/api/internal/v1/inbox/expire') {
  return new NextRequest(`http://localhost:3000${path}`, { method, headers });
}

function stubEnv(cron_secret: string | undefined) {
  vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
    ai_engine_internal_api_key: KEY,
    cron_secret,
  } as ReturnType<typeof envModule.getEnvConfig>);
}

describe('cron authentication for the internal job routes (ADR-0047)', () => {
  const expire = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    expire.mockResolvedValue({ expired_approvals: 1, expired_inputs: 0, resumed: 1, resume_failed: 0, stale_claims_released: 0, reminders_due: [] });
    vi.spyOn(container, 'getExpireInboxItemsUseCase').mockReturnValue({ execute: expire } as never);
    stubEnv(CRON);
  });

  describe('guards', () => {
    it('verifyCronBearer accepts only the exact Bearer value', () => {
      expect(verifyCronBearer(req('GET', { authorization: `Bearer ${CRON}` }))).toBe(true);
      expect(verifyCronBearer(req('GET', { authorization: `Bearer ${CRON}x` }))).toBe(false);
      expect(verifyCronBearer(req('GET', { authorization: CRON }))).toBe(false);
      expect(verifyCronBearer(req('GET', { authorization: `bearer ${CRON}` }))).toBe(false);
      expect(verifyCronBearer(req('GET'))).toBe(false);
    });

    it('never matches when CRON_SECRET is not configured, whatever the header says', () => {
      stubEnv(undefined);
      expect(verifyCronBearer(req('GET', { authorization: 'Bearer undefined' }))).toBe(false);
      expect(verifyCronBearer(req('GET', { authorization: 'Bearer ' }))).toBe(false);
      expect(verifyCronBearer(req('GET', { authorization: 'Bearer' }))).toBe(false);
    });

    it('verifyInternalJobCaller accepts the internal key or the cron bearer, nothing else', () => {
      expect(verifyInternalJobCaller(req('POST', { 'x-internal-api-key': KEY }))).toBe(true);
      expect(verifyInternalJobCaller(req('POST', { authorization: `Bearer ${CRON}` }))).toBe(true);
      expect(verifyInternalJobCaller(req('POST', { 'x-internal-api-key': 'nope' }))).toBe(false);
      expect(verifyInternalJobCaller(req('POST'))).toBe(false);
    });

    it('the internal key is not accepted as a bearer, and the cron secret is not accepted as the key', () => {
      expect(verifyInternalJobCaller(req('POST', { authorization: `Bearer ${KEY}` }))).toBe(false);
      expect(verifyInternalJobCaller(req('POST', { 'x-internal-api-key': CRON }))).toBe(false);
    });
  });

  describe('GET /api/internal/v1/inbox/expire (what Vercel Cron calls)', () => {
    it('401 without credentials and does not run the job', async () => {
      expect((await getApiExpire(req('GET'))).status).toBe(401);
      expect((await getApiExpire(req('GET', { authorization: 'Bearer wrong' }))).status).toBe(401);
      expect(expire).not.toHaveBeenCalled();
    });

    it('401 when CRON_SECRET is unset, even with an empty bearer', async () => {
      stubEnv(undefined);
      expect((await getApiExpire(req('GET', { authorization: 'Bearer ' }))).status).toBe(401);
      expect(expire).not.toHaveBeenCalled();
    });

    it('200 with the job result for the Bearer CRON_SECRET', async () => {
      const res = await getApiExpire(req('GET', { authorization: `Bearer ${CRON}` }));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({ expired_approvals: 1 });
      expect(expire).toHaveBeenCalledTimes(1);
    });

    it('is the same handler under /internal/v1', async () => {
      expect((await getExpire(req('GET', {}, '/internal/v1/inbox/expire'))).status).toBe(401);
      expect((await getExpire(req('GET', { authorization: `Bearer ${CRON}` }, '/internal/v1/inbox/expire'))).status).toBe(200);
    });
  });

  describe('POST /internal/v1/inbox/expire keeps the internal key and also takes the bearer', () => {
    it('still works with X-Internal-Api-Key', async () => {
      expect((await postApiExpire(req('POST', { 'x-internal-api-key': KEY }))).status).toBe(200);
      expect((await postExpire(req('POST', { 'x-internal-api-key': KEY }, '/internal/v1/inbox/expire'))).status).toBe(200);
    });

    it('accepts the Bearer CRON_SECRET and rejects a wrong one', async () => {
      expect((await postApiExpire(req('POST', { authorization: `Bearer ${CRON}` }))).status).toBe(200);
      expect((await postApiExpire(req('POST', { authorization: 'Bearer wrong' }))).status).toBe(401);
    });
  });

  describe('the Connections job tick takes the same credentials', () => {
    const tick = vi.fn();
    const tickResult = { planned: 1, reaped: 0, ran: 1, succeeded: 1, retried: 0, failed: 0, planner_errors: 0 };

    beforeEach(() => {
      tick.mockResolvedValue(tickResult);
      vi.spyOn(container, 'getTickJobsUseCase').mockReturnValue({ execute: tick } as never);
    });

    it('GET with the Bearer CRON_SECRET runs one beat with the default batch', async () => {
      const res = await getApiTick(req('GET', { authorization: `Bearer ${CRON}` }, '/api/internal/v1/jobs/tick'));
      expect(res.status).toBe(200);
      expect(tick).toHaveBeenCalledWith({ max_jobs: 25 });
      expect((await res.json()).data).toEqual(tickResult);
    });

    it('GET without credentials or with a wrong bearer is 401 and runs nothing', async () => {
      expect((await getApiTick(req('GET', {}, '/api/internal/v1/jobs/tick'))).status).toBe(401);
      expect((await getApiTick(req('GET', { authorization: 'Bearer wrong' }, '/api/internal/v1/jobs/tick'))).status).toBe(401);
      expect(tick).not.toHaveBeenCalled();
    });

    it('POST keeps X-Internal-Api-Key and also takes the bearer', async () => {
      expect((await postApiTick(req('POST', { 'x-internal-api-key': KEY }, '/api/internal/v1/jobs/tick'))).status).toBe(200);
      expect((await postApiTick(req('POST', { authorization: `Bearer ${CRON}` }, '/api/internal/v1/jobs/tick'))).status).toBe(200);
      expect((await postApiTick(req('POST', { authorization: 'Bearer nope' }, '/api/internal/v1/jobs/tick'))).status).toBe(401);
    });

    it('the stats route stays internal-key only', async () => {
      vi.spyOn(container, 'getJobQueue').mockReturnValue({ stats: vi.fn().mockResolvedValue({}) } as never);
      expect((await getStats(req('GET', { authorization: `Bearer ${CRON}` }, '/internal/v1/jobs/stats'))).status).toBe(401);
    });
  });

  it('the cron bearer does NOT open the sineva-ai ingest routes (least privilege)', async () => {
    const res = await postApprovals(
      new NextRequest('http://localhost:3000/internal/v1/approvals', {
        method: 'POST',
        headers: { authorization: `Bearer ${CRON}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('CRON_SECRET and DATABASE_POOL_MAX in the environment config', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    AI_ENGINE_INTERNAL_API_KEY: 'a',
    AUTH_SECRET: 'x',
    INTERNAL_CONTEXT_SIGNING_KEY: 'y',
  };

  it('CRON_SECRET is optional (Docker has no cron) and trimmed', () => {
    expect(validateEnvConfig(base).cron_secret).toBeUndefined();
    expect(validateEnvConfig({ ...base, CRON_SECRET: '  ' }).cron_secret).toBeUndefined();
    expect(validateEnvConfig({ ...base, CRON_SECRET: ` ${'c'.repeat(32)} ` }).cron_secret).toBe('c'.repeat(32));
  });

  it('CRON_SECRET shorter than 16 characters fails startup, in every environment', () => {
    expect(() => validateEnvConfig({ ...base, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/);
    const production = {
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:p7_xK9_SecureRealProdPw@db.prod-host.net:5432/sineva_platform',
      S3_ACCESS_KEY_ID: 'AKIA_PROD_S3_KEY_REAL',
      S3_SECRET_ACCESS_KEY: 's3_prod_secret_key_long_and_complex_12345',
      AI_ENGINE_INTERNAL_API_KEY: 'snv_ai_prod_key_77a98c11bf882d9e',
      AUTH_SECRET: 'auth_secret_must_be_at_least_32_characters_long_real',
      INTERNAL_CONTEXT_SIGNING_KEY: 'k'.repeat(40),
      REDIS_URL: 'rediss://default:pw@redis.example.net:6379',
      S3_ENDPOINT: 'https://s3.example.net',
      S3_PUBLIC_ENDPOINT: 'https://s3.example.net',
      AI_ENGINE_INTERNAL_URL: 'https://ai.example.net',
      INTERNAL_CONTEXT_KID: 'k1',
    };
    expect(() => validateEnvConfig({ ...production, CRON_SECRET: 'c'.repeat(32) })).not.toThrow();
    expect(() => validateEnvConfig({ ...production, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/);
  });

  it('DATABASE_POOL_MAX defaults to 10 and accepts 1 to 50', () => {
    expect(validateEnvConfig(base).database_pool_max).toBe(10);
    expect(validateEnvConfig({ ...base, DATABASE_POOL_MAX: '3' }).database_pool_max).toBe(3);
    expect(validateEnvConfig({ ...base, DATABASE_POOL_MAX: '50' }).database_pool_max).toBe(50);
  });

  it('DATABASE_POOL_MAX outside 1 to 50 or not an integer fails startup', () => {
    for (const bad of ['0', '51', '-1', '2.5', 'abc']) {
      expect(() => validateEnvConfig({ ...base, DATABASE_POOL_MAX: bad }), bad).toThrow(/DATABASE_POOL_MAX/);
    }
  });
});
