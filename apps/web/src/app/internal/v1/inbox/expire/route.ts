import type { NextRequest } from 'next/server';
import { getExpireInboxItemsUseCase } from '@/server/container';
import { verifyInternalJobCaller } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The expiry job trigger: a scheduler (cron, a platform job runner later)
// calls this with the internal key. It takes no body: the job decides what is
// due from the clock. Safe to call as often as wanted; every step is a
// conditional write and a failed resume is retried by the next call, which is
// also why Vercel's at-least-once, best-effort cron delivery is harmless.
//
// Vercel Cron only issues GET and cannot send X-Internal-Api-Key, so GET (and
// POST) also accept `Authorization: Bearer $CRON_SECRET` (ADR-0047). A GET that
// writes is unusual; it is acceptable here only because the credential is a
// header a browser or a link cannot attach, and the job never takes input.
async function run(request: NextRequest) {
  const requestId = extractRequestId(request);

  if (!verifyInternalJobCaller(request)) {
    return sendErrorJson({
      status: 401,
      code: 'unauthorized',
      message: 'Missing or invalid X-Internal-Api-Key header or cron bearer token',
      request_id: requestId,
    });
  }

  try {
    const result = await getExpireInboxItemsUseCase().execute();
    return sendSuccessJson({
      data: result,
      message: 'Inbox expiry run finished.',
      request_id: requestId,
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}

export { run as GET, run as POST };
