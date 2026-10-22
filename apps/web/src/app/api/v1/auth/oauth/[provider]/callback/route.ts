import { NextResponse, type NextRequest } from 'next/server';
import { describeOAuthFailureTarget, handleOAuthCallback } from '@/server/container';
import { setSessionCookie } from '@/server/http/auth_cookie_helper';
import { extractRequestId, handleRouteError } from '@/server/http/response_helper';
import { resolveSession, withAuth } from '@/server/http/with_auth';
import { sanitizeNextRedirect } from '@/proxy';

function clearStateCookie(response: NextResponse): void {
  response.cookies.set('sineva_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export const GET = withAuth(
  async (request: NextRequest, { params }: { params?: Promise<{ provider: string }> | { provider: string } }) => {
    try {
      const resolvedParams = await Promise.resolve(params);
      const provider = resolvedParams?.provider?.toLowerCase();
      if (!provider) {
        return NextResponse.redirect(new URL('/sign-in?error=missing_provider', request.url));
      }

      const searchParams = request.nextUrl.searchParams;
      const errorParam = searchParams.get('error');
      const stateCookie = request.cookies.get('sineva_oauth_state')?.value;
      if (errorParam) {
        // A cancelled link or re-confirm returns to the page that started it.
        const back = describeOAuthFailureTarget({
          stateCookie,
          state: searchParams.get('state'),
          error: errorParam,
        });
        const response = NextResponse.redirect(
          back
            ? new URL(sanitizeNextRedirect(back, '/'), request.url)
            : new URL(`/sign-in?error=${encodeURIComponent(errorParam)}`, request.url),
        );
        if (back) clearStateCookie(response);
        return response;
      }

      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        return NextResponse.redirect(
          new URL('/sign-in?error=missing_code_or_state', request.url),
        );
      }

      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        '127.0.0.1';
      const userAgent = request.headers.get('user-agent') || undefined;
      // Only link and re-confirm read this; a plain sign-in ignores it.
      const session = await resolveSession(request);

      const { sessionToken, targetPath } = await handleOAuthCallback({
        provider,
        code,
        state,
        stateCookie,
        session: session
          ? { userId: session.userId, sessionId: session.sessionId, freshUntil: session.freshUntil }
          : null,
        requestId: extractRequestId(request),
        ipAddress,
        userAgent,
      });

      const safeRedirect = sanitizeNextRedirect(targetPath, '/');
      const response = NextResponse.redirect(new URL(safeRedirect, request.url));

      // Link keeps the current session; sign-in and re-confirm hand back a token.
      if (sessionToken) setSessionCookie(response, sessionToken);

      clearStateCookie(response);

      return response;
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  {
    scope: 'public',
  },
);
