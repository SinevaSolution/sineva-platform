import type { NextRequest } from 'next/server';
import { toolGatewayRequestSchema } from '@/server/application/toolgateway/contracts';
import { getExecuteToolUseCase } from '@/server/container';
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
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  if (!verifyInternalApiKey(request))
    return sendErrorJson({
      status: 401,
      code: 'unauthorized',
      message: 'Internal authentication is required',
      request_id: extractRequestId(request),
    });
  try {
    const body = toolGatewayRequestSchema.parse(await parseJsonBody(request));
    const result = await getExecuteToolUseCase().execute(
      body,
      request.headers.get('x-sineva-context') ?? '',
    );
    return sendSuccessJson({
      data: result,
      message: 'Tool request processed.',
      request_id: extractRequestId(request),
    });
  } catch (error) {
    const response = handleRouteError(error, request);
    if (response.status === 429) response.headers.set('Retry-After', '60');
    return response;
  }
}
