import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggerRunRelayLog } from '@/server/infrastructure/logging/log_run_relay_log';
import { LogRunMetricsRecorder } from '@/server/infrastructure/metrics/log_run_metrics_recorder';

describe('run relay logging goes through the allowlisted logger (WP-M0-30, FR-SEC-19)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs a relay failure as run.relay_failed with the step, the handle and the error class only', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new LoggerRunRelayLog().failed('store_reply_failed', {
      run_handle: 'run_abc',
      cause: new TypeError('secret reply text'),
    });
    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry).toEqual({
      level: 'error',
      event: 'run.relay_failed',
      code: 'store_reply_failed',
      run_handle: 'run_abc',
      reason: 'TypeError',
    });
    expect(JSON.stringify(entry)).not.toContain('secret reply text');
  });

  it('logs run metrics as run.metrics with timings and no text', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    new LogRunMetricsRecorder().record({
      agent_slug: 'sinofinance',
      reply_language: 'id',
      outcome: 'completed',
      first_token_ms: 400,
      total_ms: 1500,
    });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
      level: 'info',
      event: 'run.metrics',
      code: 'completed',
      agent_slug: 'sinofinance',
      locale: 'id',
      first_token_ms: 400,
      total_ms: 1500,
    });
  });
});
