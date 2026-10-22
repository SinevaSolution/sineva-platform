import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getJwtAuthService } from '@/server/container';
import type { RequestContext } from '@/server/domain/context/request_context';
import { SESSION_COOKIE_NAME } from './auth_cookie_helper';

/** Server-page reads use the same current membership and specialist scope as the API guard. */
export const getWorkspacePageContext = cache(
  async (workspaceId: string): Promise<RequestContext> => {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await getJwtAuthService().resolveSessionFromToken(token) : null;
    if (!session) redirect('/sign-in');
    const membership = session.memberships.find((entry) => entry.workspaceId === workspaceId);
    if (!membership) notFound();
    return {
      user_id: session.userId,
      workspace_id: workspaceId,
      session_id: session.sessionId,
      request_id: crypto.randomUUID(),
      role: membership.role,
      specialist_scope: membership.specialistScope,
      allowed_specialists: membership.allowedSpecialists,
      fresh_until: session.freshUntil,
      email_verified: session.emailVerified,
      actor: { type: 'user', id: session.userId },
    };
  },
);
