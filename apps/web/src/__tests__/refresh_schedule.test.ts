import { describe, expect, it } from 'vitest';
import { computeRefreshAt } from '@/server/domain/connections/refresh_schedule';

// FR-CONN-20: about 80 percent of the lifetime, plus or minus 10 percent, 5 minute floor.

const T0 = new Date('2026-10-23T10:00:00.000Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 3_600_000;

describe('computeRefreshAt (FR-CONN-20)', () => {
  it('lands at 80 percent of a one hour lifetime with no jitter offset', () => {
    expect(computeRefreshAt(T0, plus(HOUR), () => 0.5).getTime()).toBe(T0.getTime() + 0.8 * HOUR);
  });

  it('stays inside plus or minus 10 percent of the lifetime for any random value', () => {
    for (let i = 0; i < 500; i += 1) {
      const at = computeRefreshAt(T0, plus(4 * HOUR)).getTime() - T0.getTime();
      expect(at).toBeGreaterThanOrEqual(0.7 * 4 * HOUR);
      // The 5 minute floor can only pull it earlier than 90 percent, never later.
      expect(at).toBeLessThanOrEqual(0.9 * 4 * HOUR);
    }
    expect(computeRefreshAt(T0, plus(HOUR), () => 0).getTime() - T0.getTime()).toBe(0.7 * HOUR);
    expect(computeRefreshAt(T0, plus(HOUR), () => 0.999999).getTime() - T0.getTime()).toBeLessThanOrEqual(0.9 * HOUR);
  });

  it('never leaves less than 5 minutes before expiry (the floor)', () => {
    // A 10 minute token: 80 percent would be 8 minutes in, leaving 2. The floor says 5 minutes in.
    const at = computeRefreshAt(T0, plus(10 * 60_000), () => 0.5);
    expect(at.getTime()).toBe(T0.getTime() + 5 * 60_000);
    for (let i = 0; i < 200; i += 1) {
      const refresh = computeRefreshAt(T0, plus(15 * 60_000));
      expect(plus(15 * 60_000).getTime() - refresh.getTime()).toBeGreaterThanOrEqual(5 * 60_000);
    }
  });

  it('never refreshes sooner than 30 seconds after issue, even for a tiny lifetime', () => {
    expect(computeRefreshAt(T0, plus(60_000), () => 0.5).getTime()).toBe(T0.getTime() + 30_000);
    expect(computeRefreshAt(T0, plus(0), () => 0.5).getTime()).toBe(T0.getTime() + 30_000);
  });

  it('spreads connections created together (the jitter is real)', () => {
    const times = new Set(Array.from({ length: 50 }, () => computeRefreshAt(T0, plus(4 * HOUR)).getTime()));
    expect(times.size).toBeGreaterThan(40);
  });

  it('Shopee-style 4 hour tokens refresh roughly every 3 hours', () => {
    const at = computeRefreshAt(T0, plus(4 * HOUR), () => 0.5).getTime() - T0.getTime();
    expect(at / HOUR).toBeCloseTo(3.2, 5);
  });
});
