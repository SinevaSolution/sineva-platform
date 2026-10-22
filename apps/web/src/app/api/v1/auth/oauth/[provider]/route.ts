import { NextResponse, type NextRequest } from 'next/server';
import { initiateOAuthFlow, isOAuthProviderConfigured } from '@/server/container';
import { withOAuthNotice } from '@/server/application/use-cases/auth/oauth_intent_callback_use_case';
import { sanitizeNextRedirect } from '@/server/domain/auth/safe_redirect';
import { appRedirectUrl } from '@/server/http/app_redirect';
import { handleRouteError } from '@/server/http/response_helper';
import { resolveSession, withAuth } from '@/server/http/with_auth';
import { OAUTH_INTENTS, type OAuthIntent } from '@/server/domain/auth/oauth_intent';

export const GET = withAuth(
  async (request: NextRequest, { params }: { params?: Promise<{ provider: string }> | { provider: string } }) => {
    try {
      const resolvedParams = await Promise.resolve(params);
      const provider = resolvedParams?.provider?.toLowerCase();
      if (!provider) {
        return NextResponse.redirect(appRedirectUrl('/sign-in?error=missing_provider'));
      }

      const searchParams = request.nextUrl.searchParams;
      const returnTo = searchParams.get('return_to') ?? searchParams.get('next') ?? undefined;
      const intent = (searchParams.get('intent') ?? 'sign_in') as OAuthIntent;
      if (!OAUTH_INTENTS.includes(intent)) {
        return NextResponse.redirect(appRedirectUrl('/sign-in?error=invalid_intent'));
      }

      let flow: { authUrl: string; signedCookieValue: string };
      if (intent === 'sign_in') {
        flow = initiateOAuthFlow(provider, { returnTo });
      } else {
        // Link and re-confirm act on a signed-in person: the state is bound to
        // them, so the callback can refuse a browser that changed hands.
        const session = await resolveSession(request);
        const back = sanitizeNextRedirect(returnTo, '/');
        if (!session) {
          const signIn = appRedirectUrl('/sign-in');
          signIn.searchParams.set('next', back);
          return NextResponse.redirect(signIn);
        }
        if (!isOAuthProviderConfigured(provider)) {
          return NextResponse.redirect(appRedirectUrl(withOAuthNotice(back, 'not_configured')));
        }
        flow = initiateOAuthFlow(provider, { returnTo: back, intent, userId: session.userId });
      }

      const response = NextResponse.redirect(flow.authUrl);
      const isProduction = process.env.NODE_ENV === 'production';

      response.cookies.set('sineva_oauth_state', flow.signedCookieValue, {
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
