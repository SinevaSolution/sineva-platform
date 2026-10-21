import { NextResponse, type NextRequest } from 'next/server';
import { handleOAuthCallback } from '@/server/container';
import { setSessionCookie } from '@/server/http/auth_cookie_helper';
import { handleRouteError } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { sanitizeNextRedirect } from '@/proxy';

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
      if (errorParam) {
        return NextResponse.redirect(
          new URL(`/sign-in?error=${encodeURIComponent(errorParam)}`, request.url),
        );
      }

      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        return NextResponse.redirect(
          new URL('/sign-in?error=missing_code_or_state', request.url),
        );
      }

      const stateCookie = request.cookies.get('sineva_oauth_state')?.value;
      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        '127.0.0.1';
      const userAgent = request.headers.get('user-agent') || undefined;

      const { sessionToken, targetPath } = await handleOAuthCallback({
        provider,
        code,
        state,
        stateCookie,
        ipAddress,
        userAgent,
      });

      const safeRedirect = sanitizeNextRedirect(targetPath, '/');
      const response = NextResponse.redirect(new URL(safeRedirect, request.url));

      // Set session cookie
      setSessionCookie(response, sessionToken);

      // Clear OAuth state cookie
      response.cookies.set('sineva_oauth_state', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });

      return response;
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  {
    scope: 'public',
  },
);
