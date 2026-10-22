import type { NextRequest } from 'next/server';
import { WorkflowRunEventSchema } from '@/server/application/workflows/run_event_dto';
import { getApplyWorkflowRunEventUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

// Run progress from sineva-ai (ADR-0046). Guarded by X-Internal-Api-Key only:
// sineva-ai cannot mint a signed context, so there is no session or membership
// to check. The tenant in the body is a claim; the use case accepts it only if
// that workspace owns the run. Every 2xx is an acknowledgement, including
// "duplicate" and "not applied" (stale), so sineva-ai never retries an event
// the platform has already judged.
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
    const event = WorkflowRunEventSchema.parse(await parseJsonBody(request));
    const result = await getApplyWorkflowRunEventUseCase().execute(event, requestId);
    return sendSuccessJson({
      data: result,
      message: 'Workflow run event recorded.',
      request_id: requestId,
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
