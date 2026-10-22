import type { NextRequest } from 'next/server';
import { getEnqueueConnectionReconcileUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Runbook command (FR-CONN-19): after a database restore, queue a sweep that probes
// every connection and marks the ones that fail as needing a reconnect. Takes no
// body. Returns 202 with the first job; the rest of the sweep queues itself.
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
    const result = await getEnqueueConnectionReconcileUseCase().execute();
    return sendSuccessJson({
      data: result,
      message: 'Connection sweep queued.',
      request_id: requestId,
      status: 202,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
