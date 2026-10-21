import type { NextRequest } from 'next/server';
import type { UserRole } from '@/server/domain/entities/user';
import {
  setCustomSessionResolver,
  type ResolvedSession,
} from '@/server/http/with_auth';

/**
 * Route-test session fake. Reads `x-test-*` request headers so one test file can
 * issue requests as different users without a JWT per case. It lives under
 * __tests__ and is installed through `setCustomSessionResolver`, so the headers
 * mean nothing to the production guard.
 *
 * - `x-test-unauthenticated: true` resolves no session (401 path).
 * - `x-test-session-user-id` plus optional role, workspaces, specialists,
 *   specialist scope, staff role and email verification build a session.
 * - With neither header the default session is an owner on every workspace with
 *   operator staff access, so tests that are not about auth stay short.
 */
export async function headerSessionResolver(
  request?: NextRequest,
): Promise<ResolvedSession | null> {
  if (request?.headers?.get('x-test-unauthenticated') === 'true') {
    return null;
  }

  const testUserId = request?.headers?.get('x-test-session-user-id');
  if (!testUserId) {
    return {
      userId: 'usr_test_default',
      sessionId: 'test-sess-default',
      role: 'owner',
      freshUntil: new Date(Date.now() + 3600000),
      staffRole: 'operator',
      memberships: [{ workspaceId: '*', role: 'owner', specialistScope: 'all' }],
    };
  }

  const role = (request?.headers?.get('x-test-session-role') ?? 'member') as UserRole;
  const workspaces = request?.headers?.get('x-test-session-workspaces')?.split(',') ?? [];
  const allowedSpecialists = request?.headers?.get('x-test-session-specialists')?.split(',');
  const specialistScope =
    request?.headers?.get('x-test-specialist-scope') === 'selected' ? 'selected' : 'all';
  const staffRole = request?.headers?.get('x-test-staff-role') as
    | 'operator'
    | 'platform_admin'
    | null;

  return {
    userId: testUserId,
    sessionId: `test-sess-${testUserId}`,
    role,
    freshUntil: new Date(Date.now() + 3600000),
    staffRole,
    emailVerified: request?.headers?.get('x-test-email-verified') !== 'false',
    memberships: workspaces.map((workspaceId) => ({
      workspaceId: workspaceId.trim(),
      role,
      specialistScope,
      allowedSpecialists,
    })),
  };
}

export function installHeaderSessionResolver(): void {
  setCustomSessionResolver(headerSessionResolver);
}
