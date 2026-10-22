import { describe, expect, it } from 'vitest';
import { DEFAULT_RETRY_POLICY, computeBackoffMs } from '@/server/domain/jobs/job';
import { InMemoryJobQueue } from './fakes/in_memory_job_queue';
import { describeJobQueueContract } from './job_queue_contract';

describeJobQueueContract('in-memory fake', () => new InMemoryJobQueue());

describe('computeBackoffMs (ADR-0038 retry policy)', () => {
  const policy = { base_delay_ms: 1000, max_delay_ms: 10_000, jitter: 0.25 };

  it('doubles per attempt before jitter', () => {
    const mid = () => 0.5; // jitter factor 1.0
    expect(computeBackoffMs(1, policy, mid)).toBe(1000);
    expect(computeBackoffMs(2, policy, mid)).toBe(2000);
    expect(computeBackoffMs(3, policy, mid)).toBe(4000);
  });

  it('caps the delay before jitter', () => {
    expect(computeBackoffMs(20, policy, () => 0.5)).toBe(10_000);
  });

  it('keeps jitter inside plus or minus the configured share', () => {
    expect(computeBackoffMs(1, policy, () => 0)).toBe(750);
    expect(computeBackoffMs(1, policy, () => 0.999999)).toBeLessThanOrEqual(1250);
    expect(computeBackoffMs(1, policy, () => 0.999999)).toBeGreaterThan(1240);
    for (let i = 0; i < 200; i += 1) {
      const delay = computeBackoffMs(4, policy);
      expect(delay).toBeGreaterThanOrEqual(6000);
      expect(delay).toBeLessThanOrEqual(10_000 * 1.25);
    }
  });

  it('has a sane default policy', () => {
    expect(DEFAULT_RETRY_POLICY.jitter).toBe(0.25);
    expect(computeBackoffMs(1, DEFAULT_RETRY_POLICY, () => 0.5)).toBe(5000);
  });
});
