import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { JobRunner } from '@/server/application/jobs/job_runner';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';
import { ConflictError } from '@/server/domain/errors/domain_error';
import { RetryableJobError } from '@/server/domain/jobs/job';
import { VaultDecryptError } from '@/server/domain/vault/vault';
import { handleRouteError } from '@/server/http/response_helper';
import { LoggerJobLog } from '@/server/infrastructure/logging/log_job_log';
import { logger } from '@/server/infrastructure/logging/logger';
import { LocalKms } from '@/server/infrastructure/vault/local_kms';
import { VaultService } from '@/server/infrastructure/vault/vault_service';
import { FakeAuditEventRepository } from './fakes/fake_audit_event_repository';
import { InMemoryJobQueue } from './fakes/in_memory_job_queue';
import { InMemoryVaultRepository } from './fakes/in_memory_vault_repository';
import { assertNoMarkers, captureConsole, seedCanaries, type ConsoleCapture } from './helpers/canary_secrets';

// G1 (WP-M2-06): no plaintext token or key in logs, error bodies, audit rows or
// job rows. Each case seeds canary credentials into a path that handles them
// and searches every capture afterwards. This file is part of `npm run test`,
// which blocks merge in CI; later work packages (OAuth, refresh, API-key flows)
// add their own cases through the same helpers.

describe('canary credential scan (G1)', () => {
  let capture: ConsoleCapture | null = null;
  afterEach(() => capture?.restore());

  it('the logger masks credential-shaped text in every allowed string field', () => {
    const canaries = seedCanaries();
    capture = captureConsole();
    for (const secret of [canaries.access_token, canaries.refresh_token, canaries.api_key]) {
      logger.error('ai_engine.non_2xx', { code: secret, reason: `failed with ${secret}`, request_id: secret });
    }
    logger.warn('job.retry_scheduled', { job_type: canaries.access_token, code: `Bearer ${canaries.bearer}` });
    assertNoMarkers('logger output', capture.text(), canaries);
    expect(capture.lines.length).toBeGreaterThan(0);
  });

  it('a token endpoint body and an OAuth callback URL are masked when they land in a log string', () => {
    const canaries = seedCanaries();
    capture = captureConsole();
    logger.error('ai_engine.non_json', {
      reason: `{"access_token":"${canaries.access_token}","refresh_token":"${canaries.refresh_token}","client_secret":"${canaries.client_secret}"}`,
    });
    logger.error('http.unhandled_error', {
      reason: `GET /api/v1/connections/oauth/callback?code=${canaries.code}&state=${canaries.state}`,
    });
    logger.error('http.unhandled_error', { reason: `code_verifier=${canaries.code_verifier}` });
    assertNoMarkers('logger output', capture.text(), canaries);
  });

  it('an unhandled error never reaches the response or the log with its message', async () => {
    const canaries = seedCanaries();
    capture = captureConsole();
    const response = handleRouteError(new Error(`upstream said ${canaries.access_token} ${canaries.refresh_token}`));
    expect(response.status).toBe(500);
    assertNoMarkers('error response', JSON.stringify(await response.json()), canaries);
    assertNoMarkers('error log', capture.text(), canaries);
  });

  it('a job that fails with a credential in its error message stores and logs only a code', async () => {
    const canaries = seedCanaries();
    capture = captureConsole();
    const queue = new InMemoryJobQueue();
    const runner = new JobRunner({ queue, log: new LoggerJobLog(), workerId: 'w1', now: () => new Date('2026-10-23T10:00:00Z') });
    runner.register('connection.refresh', async () => {
      throw new Error(`refresh refused: ${canaries.refresh_token}`);
    });
    runner.register('connection.health', async () => {
      throw new RetryableJobError('network', { cause: new Error(canaries.access_token) });
    });
    const failed = await queue.enqueue(
      { job_type: 'connection.refresh', payload: { connection_id: 'c1' } },
      new Date('2026-10-23T10:00:00Z'),
    );
    const retried = await queue.enqueue({ job_type: 'connection.health' }, new Date('2026-10-23T10:00:00Z'));
    await runner.runBatch(10);

    const rows = JSON.stringify([await queue.get(failed.job.id), await queue.get(retried.job.id)]);
    assertNoMarkers('job rows', rows, canaries);
    assertNoMarkers('job logs', capture.text(), canaries);
    expect(rows).toContain('unhandled_error');
  });

  it('the vault never writes plaintext to the row, and its errors carry no key material', async () => {
    const canaries = seedCanaries();
    capture = captureConsole();
    const repo = new InMemoryVaultRepository();
    const vault = new VaultService(
      repo,
      new LocalKms({ current: `local-canary:${randomBytes(32).toString('base64')}`, production: false }),
    );
    const ref = {
      owner_type: 'connection' as const,
      owner_id: '11111111-1111-4111-8111-111111111111',
      workspace_id: '22222222-2222-4222-8222-222222222222',
      provider_id: 'google_calendar',
    };
    await vault.put(ref, { access_token: canaries.access_token, refresh_token: canaries.refresh_token });
    const row = (await repo.find('connection', ref.owner_id))!;
    assertNoMarkers('vault row', JSON.stringify(row) + row.ciphertext.toString('latin1'), canaries);

    row.ciphertext[0] = row.ciphertext[0]! ^ 1;
    repo.rows.set(`connection:${ref.owner_id}`, row);
    const error = await vault.get(ref).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultDecryptError);
    assertNoMarkers('vault error', JSON.stringify(error) + String((error as Error).message), canaries);
  });

  it('audit rows mask credential-shaped text even under an innocent key name', async () => {
    const canaries = seedCanaries();
    const repository = new FakeAuditEventRepository();
    await new RepositoryAuditLogger(repository).log({
      action: 'connection.created',
      context: createAnonymousRequestContext('req_1'),
      workspace_id: '22222222-2222-4222-8222-222222222222',
      metadata: {
        // Keys a developer might pick without thinking: none says "token".
        note: `connected with ${canaries.access_token}`,
        details: { upstream: `Bearer ${canaries.bearer}`, list: [canaries.api_key] },
        provider_id: 'google_calendar',
        scope_count: 2,
      },
      change: { after: { label: canaries.refresh_token } },
    });
    const stored = JSON.stringify(repository.rows);
    assertNoMarkers('audit row', stored, canaries);
    // Ids, counts and names survive.
    expect(stored).toContain('google_calendar');
    expect(stored).toContain('"scope_count":2');
  });

  it('an application error that names a conflict does not carry a credential', async () => {
    const canaries = seedCanaries();
    const response = handleRouteError(new ConflictError('Connection', 'acct-1'));
    assertNoMarkers('conflict response', JSON.stringify(await response.json()), canaries);
  });
});
