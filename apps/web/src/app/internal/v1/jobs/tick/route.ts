import type { NextRequest } from 'next/server';
import { tickJobsRequestSchema } from '@/server/application/dtos/jobs_dto';
import { getTickJobsUseCase } from '@/server/container';
import { verifyInternalJobCaller } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseOptionalJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The scheduler beat (ADR-0038): the platform has no scheduler, so whatever
// does (cron, a worker process later) calls this about once a minute. It plans
// what is due, takes back jobs of dead workers and runs a bounded batch. Safe
// to call as often as wanted: planning is idempotent and claims are exclusive.
//
// Vercel Cron only issues GET and cannot send X-Internal-Api-Key, so GET (and
// POST) also accept `Authorization: Bearer $CRON_SECRET` (ADR-0047). The stats
// route next to it stays internal-key only.
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
    const body = tickJobsRequestSchema.parse(await parseOptionalJsonBody(request));
    const result = await getTickJobsUseCase().execute({ max_jobs: body.max_jobs });
    return sendSuccessJson({
      data: result,
      message: 'Job tick finished.',
      request_id: requestId,
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}

export { run as GET, run as POST };
