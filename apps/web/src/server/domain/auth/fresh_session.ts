import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError } from '@/server/domain/errors/domain_error';

/**
 * Fresh-session mechanism (FR-AUTH-06)
 * - Sensitive actions require fresh_until to be strictly in the future.
 * - Standard fresh window: 15 minutes from last sign-in or re-auth.
 */
export function isSessionFresh(
  freshUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!freshUntil) {
    return false;
  }
  return freshUntil.getTime() > now.getTime();
}

export function requireFreshSession(
  requestContext: RequestContext,
  now: Date = new Date(),
): void {
  if (!isSessionFresh(requestContext.fresh_until, now)) {
    throw new ForbiddenError('A fresh session is required for this action. Please re-authenticate.');
  }
}
