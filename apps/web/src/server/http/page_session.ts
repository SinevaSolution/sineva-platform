import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getJwtAuthService } from '@/server/container';
import { SESSION_COOKIE_NAME } from '@/server/http/auth_cookie_helper';

export interface PageSession {
  user_id: string;
  email: string;
  name: string;
  memberships: Array<{ workspace_id: string; role: string }>;
}

/**
 * Session for server components (layouts and pages). Route handlers keep
 * using `withAuth`. Wrapped in React `cache` so a layout and its page share
 * one lookup per request instead of verifying the token twice.
 */
export const getPageSession = cache(async (): Promise<PageSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const resolved = await getJwtAuthService().resolveSessionFromToken(token);
  if (!resolved) {
    return null;
  }
  return {
    user_id: resolved.userId,
    email: resolved.email,
    name: resolved.name,
    memberships: resolved.memberships.map((m) => ({
      workspace_id: m.workspaceId,
      role: m.role,
    })),
  };
});
