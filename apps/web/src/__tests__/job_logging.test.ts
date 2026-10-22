import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggerJobLog } from '@/server/infrastructure/logging/log_job_log';

// ADR-0038: job lines carry the type, an opaque job id, the attempt and a
// stable code. They never carry the payload.
describe('LoggerJobLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes allowlisted fields as a job.* event', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    new LoggerJobLog().record('job.succeeded', {
      job_type: 'connection.refresh',
      job_id: '7d0c6a4e-7b1f-4c2a-9e83-0f6a2b1d4c77',
      attempt: 2,
    });
    const entry = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      event: 'job.succeeded',
      job_type: 'connection.refresh',
      job_id: '7d0c6a4e-7b1f-4c2a-9e83-0f6a2b1d4c77',
      attempt: 2,
    });
    expect(entry.dropped_fields).toBeUndefined();
  });

  it('logs failures at error level with the code and masks secret-shaped text in a code', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    new LoggerJobLog().record('job.failed', {
      job_type: 'connection.refresh',
      code: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789',
    });
    const line = String(spy.mock.calls[0]![0]);
    expect(line).toContain('job.failed');
    expect(line).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('logs retries at warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new LoggerJobLog().record('job.retry_scheduled', { job_type: 'x', code: 'network', attempt: 1 });
    expect(JSON.parse(String(spy.mock.calls[0]![0])).event).toBe('job.retry_scheduled');
  });
});
