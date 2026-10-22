import type { NextRequest } from 'next/server';
import { createApprovalRequestSchema } from '@/server/application/inbox/approval_contract_dto';
import { getIngestRunInboxEventUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Guarded by X-Internal-Api-Key only (sineva-ai holds no session). The
// workspace and run handle in the body are checked against `chat_runs` by the
// use case; the recipient comes from the platform's own records, never from
// the body, and a body that names a user is a 422 (the schema is strict).
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
    const body = createApprovalRequestSchema.parse(await parseJsonBody(request));
    const result = await getIngestRunInboxEventUseCase().createApproval(body, requestId);
    return sendSuccessJson({
      data: result,
      message: result.created ? 'Approval recorded.' : 'Approval already recorded.',
      request_id: requestId,
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
