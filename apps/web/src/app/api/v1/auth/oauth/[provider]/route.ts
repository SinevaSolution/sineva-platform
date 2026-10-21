import { NextResponse, type NextRequest } from 'next/server';
import { initiateOAuthFlow } from '@/server/container';
import { handleRouteError } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth(
  async (request: NextRequest, { params }: { params?: Promise<{ provider: string }> | { provider: string } }) => {
    try {
      const resolvedParams = await Promise.resolve(params);
      const provider = resolvedParams?.provider?.toLowerCase();
      if (!provider) {
        return NextResponse.redirect(new URL('/login?error=missing_provider', request.url));
      }

      const searchParams = request.nextUrl.searchParams;
      const returnTo = searchParams.get('return_to') ?? searchParams.get('next') ?? undefined;

      const { authUrl, signedCookieValue } = initiateOAuthFlow(provider, returnTo);

      const response = NextResponse.redirect(authUrl);
      const isProduction = process.env.NODE_ENV === 'production';

      response.cookies.set('sineva_oauth_state', signedCookieValue, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 600, // 10 minutes
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
