/**
 * Account Lockout Calculator (FR-AUTH-04)
 * - 5 consecutive failures lock for 15 minutes
 * - Doubling per repeat lockout: 15, 30, 60, 120, 240, 480, 960, up to 1440 mins (24h)
 * - Reset on successful login
 */
export interface LockoutState {
  isLocked: boolean;
  durationMinutes: number;
  lockedUntil: Date | null;
}

export function calculateLockoutState(
  consecutiveFailures: number,
  previousLockoutCount: number = 0,
  now: Date = new Date(),
): LockoutState {
  if (consecutiveFailures < 5) {
    return {
      isLocked: false,
      durationMinutes: 0,
      lockedUntil: null,
    };
  }

  // Base 15 minutes doubled per prior lockout: 15 * 2^previousLockoutCount
  const calculatedMinutes = 15 * Math.pow(2, Math.max(0, previousLockoutCount));
  const durationMinutes = Math.min(1440, calculatedMinutes); // Cap at 24 hours (1440 min)
  const lockedUntil = new Date(now.getTime() + durationMinutes * 60 * 1000);

  return {
    isLocked: true,
    durationMinutes,
    lockedUntil,
  };
}
