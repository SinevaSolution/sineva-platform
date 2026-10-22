import type { NextRequest } from 'next/server';
import { createInputRequestRequestSchema } from '@/server/application/inbox/approval_contract_dto';
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

// Same guard and trust rules as POST /internal/v1/approvals.
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
    const body = createInputRequestRequestSchema.parse(await parseJsonBody(request));
    const result = await getIngestRunInboxEventUseCase().createInputRequest(body, requestId);
    return sendSuccessJson({
      data: result,
      message: result.created ? 'Input request recorded.' : 'Input request already recorded.',
      request_id: requestId,
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
