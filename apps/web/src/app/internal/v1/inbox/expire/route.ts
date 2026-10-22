import type { NextRequest } from 'next/server';
import { getExpireInboxItemsUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
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
// conditional write and a failed resume is retried by the next call.
export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request);

  if (!verifyInternalApiKey(request)) {
    return sendErrorJson({
      status: 401,
      code: 'unauthorized',
      message: 'Missing or invalid X-Internal-Api-Key header',
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
