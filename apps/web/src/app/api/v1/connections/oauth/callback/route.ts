import { NextResponse, type NextRequest } from 'next/server';
import { oauthCallbackQuerySchema } from '@/server/application/dtos/connection_dto';
import { getConnectionLog, getHandleOAuthCallbackUseCase } from '@/server/container';
import { searchParamsToObject } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The provider's redirect target (FR-CONN-10). A cross-site top-level GET: the
// session cookie is SameSite=Lax, so it is sent, and a GET needs no CSRF header.
// The scope is `public` only so an unauthenticated visit reaches the use case,
// which turns it into a calm result; this route never answers with JSON,
// because the person is looking at a browser tab and the query holds a
// one-time code. Every outcome is a 302 to a path in this app.
function redirect(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 302);
  // The URL that brought the person here carried a code and a state: keep it
  // out of caches and out of the Referer of whatever page comes next.
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    const parsed = oauthCallbackQuerySchema.safeParse(searchParamsToObject(request));
    if (!parsed.success) return redirect(request, '/?connection_result=error');
    const signedIn = requestContext.user_id !== 'anonymous';
    try {
      const result = await getHandleOAuthCallbackUseCase().execute({
        query: {
          code: parsed.data.code,
          state: parsed.data.state,
          iss: parsed.data.iss,
          error: parsed.data.error,
        },
        session: signedIn
          ? { user_id: requestContext.user_id, session_id: requestContext.session_id }
          : { user_id: null, session_id: null },
        request_id: requestContext.request_id,
      });
      return redirect(request, result.redirect_to);
    } catch (error) {
      // Only the error class is logged: the message and the URL can quote the code.
      getConnectionLog().failed('callback_failed', { code: error instanceof Error ? error.name : 'unknown' });
      return redirect(request, '/?connection_result=error');
    }
  },
  { scope: 'public' },
);
