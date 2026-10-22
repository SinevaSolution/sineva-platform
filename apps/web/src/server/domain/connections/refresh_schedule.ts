// When to refresh an access token (FR-CONN-20). Pure, so the bounds can be tested
// without a clock or a database.

const FIVE_MINUTES_MS = 5 * 60_000;
const MIN_DELAY_MS = 30_000;

/**
 * About 80 percent of the token's lifetime after it was issued, spread by plus
 * or minus 10 percent of the lifetime so many connections created together do
 * not all refresh in the same second. Never later than 5 minutes before expiry
 * (the floor that matters for short-lived tokens, where 80 percent would leave
 * under a minute), and never sooner than 30 seconds after issue so a very short
 * token cannot spin. `random` is injected (0 inclusive, 1 exclusive) for tests.
 */
export function computeRefreshAt(issuedAt: Date, expiresAt: Date, random: () => number = Math.random): Date {
  const issued = issuedAt.getTime();
  const expires = expiresAt.getTime();
  const lifetime = Math.max(0, expires - issued);
  const fraction = 0.8 + (random() * 0.2 - 0.1);
  const target = issued + lifetime * fraction;
  const latest = expires - FIVE_MINUTES_MS;
  const at = Math.max(Math.min(target, latest), issued + MIN_DELAY_MS);
  return new Date(at);
}
