import { NextResponse, type NextRequest } from 'next/server';
import { getStreamRunUseCase } from '@/server/container';
import { handleRouteError } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// The relay needs a long-lived Node response: never the edge runtime, never
// a cached or statically rendered one (FR-AIR-12).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ workspace_id: string; run_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const stream = await getStreamRunUseCase().execute(
        params?.run_id ?? '',
        { last_event_id: request.headers.get('last-event-id') ?? undefined },
        requestContext,
      );
      // Ownership and the run lookup happen inside execute, before any
      // upstream call, so failures up to here are ordinary JSON errors (404).
      // From here on, failures travel inside the stream as `error` events.
      return new NextResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          // no-transform also stops the Node server's gzip from buffering frames.
          'Cache-Control': 'no-cache, no-transform',
          'Content-Encoding': 'identity',
          // Tell nginx-style proxies not to buffer the stream.
          'X-Accel-Buffering': 'no',
          'X-Request-Id': requestContext.request_id,
        },
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    // Attaching can start a run, so it needs the permission to send.
    permission: 'chat.send',
  },
);
