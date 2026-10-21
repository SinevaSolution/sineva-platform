import { describe, expect, it } from 'vitest';
import { validatePassword } from '@/server/domain/auth/password_policy';
import { calculateLockoutState } from '@/server/domain/auth/lockout_calculator';
import { FakeBreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import { isSessionFresh, requireFreshSession } from '@/server/domain/auth/fresh_session';
import { ForbiddenError } from '@/server/domain/errors/domain_error';
import type { RequestContext } from '@/server/domain/context/request_context';

describe('Auth Domain: Password Policy (FR-AUTH-02)', () => {
  it('accepts passwords between 12 and 128 characters with any composition', () => {
    // Exactly 12 chars
    expect(validatePassword('123456789012').valid).toBe(true);
    // 15 chars simple text (no symbols or uppercase required per NIST SP 800-63B)
    expect(validatePassword('correct horse battery staple').valid).toBe(true);
    // Exactly 128 chars
    expect(validatePassword('a'.repeat(128)).valid).toBe(true);
  });

  it('rejects passwords shorter than 12 characters', () => {
    const res = validatePassword('short1234');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('at least 12 characters');
  });

  it('rejects passwords longer than 128 characters', () => {
    const res = validatePassword('a'.repeat(129));
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('cannot exceed 128 characters');
  });

  it('allows spaces and paste without character type restrictions', () => {
    expect(validatePassword('kopisusu panas enak sekali').valid).toBe(true);
  });
});

describe('Auth Domain: Breached Password Checker (FR-AUTH-02, D-M0-12)', () => {
  it('detects known breached passwords via FakeBreachedPasswordChecker', async () => {
    const checker = new FakeBreachedPasswordChecker(['password123456', 'correcthorsebattery']);
    expect(await checker.isBreached('password123456')).toBe(true);
    expect(await checker.isBreached('correcthorsebattery')).toBe(true);
    expect(await checker.isBreached('super-secure-unbreached-pass-2026')).toBe(false);
  });
});

describe('Auth Domain: Account Lockout Calculator (FR-AUTH-04)', () => {
  const baseTime = new Date('2026-10-21T12:00:00Z');

  it('does not lock account with fewer than 5 consecutive failures', () => {
    for (let failures = 0; failures < 5; failures++) {
      const state = calculateLockoutState(failures, 0, baseTime);
      expect(state.isLocked).toBe(false);
      expect(state.lockedUntil).toBeNull();
      expect(state.durationMinutes).toBe(0);
    }
  });

  it('locks for 15 minutes on 5 consecutive failures (1st lockout)', () => {
    const state = calculateLockoutState(5, 0, baseTime);
    expect(state.isLocked).toBe(true);
    expect(state.durationMinutes).toBe(15);
    expect(state.lockedUntil?.toISOString()).toBe(
      new Date(baseTime.getTime() + 15 * 60 * 1000).toISOString(),
    );
  });

  it('doubles lockout duration on repeat lockouts (15 -> 30 -> 60 -> 120 -> 240 -> 480 -> 960 -> 1440)', () => {
    const expectedDurations = [15, 30, 60, 120, 240, 480, 960, 1440, 1440];
    for (let prevCount = 0; prevCount < expectedDurations.length; prevCount++) {
      const state = calculateLockoutState(5, prevCount, baseTime);
      expect(state.isLocked).toBe(true);
      expect(state.durationMinutes).toBe(expectedDurations[prevCount]);
    }
  });

  it('caps repeat lockout duration at 1440 minutes (24 hours)', () => {
    const state = calculateLockoutState(5, 10, baseTime);
    expect(state.durationMinutes).toBe(1440);
  });
});

describe('Auth Domain: Fresh Session Verification (FR-AUTH-06)', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  it('considers session fresh if fresh_until is in the future', () => {
    const futureFresh = new Date(now.getTime() + 5 * 60 * 1000);
    expect(isSessionFresh(futureFresh, now)).toBe(true);
  });

  it('considers session stale if fresh_until has passed or is null', () => {
    const pastFresh = new Date(now.getTime() - 1000);
    expect(isSessionFresh(pastFresh, now)).toBe(false);
    expect(isSessionFresh(null, now)).toBe(false);
    expect(isSessionFresh(undefined, now)).toBe(false);
  });

  it('requireFreshSession succeeds when fresh_until is valid', () => {
    const ctx: RequestContext = {
      user_id: 'usr-123',
      workspace_id: 'ws-123',
      role: 'owner',
      specialist_scope: 'all',
      session_id: 'sess-123',
      request_id: 'req-123',
      fresh_until: new Date(now.getTime() + 10 * 60 * 1000),
    };

    expect(() => requireFreshSession(ctx, now)).not.toThrow();
  });

  it('requireFreshSession throws ForbiddenError when fresh_until is stale or missing', () => {
    const ctxStale: RequestContext = {
      user_id: 'usr-123',
      workspace_id: 'ws-123',
      role: 'owner',
      specialist_scope: 'all',
      session_id: 'sess-123',
      request_id: 'req-123',
      fresh_until: new Date(now.getTime() - 1000),
    };

    expect(() => requireFreshSession(ctxStale, now)).toThrow(ForbiddenError);
  });
});
