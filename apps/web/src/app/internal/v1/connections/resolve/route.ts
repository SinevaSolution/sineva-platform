import type { NextRequest } from 'next/server';
import { resolveConnectionQuerySchema } from '@/server/application/toolgateway/contracts';
import { getResolveToolConnectionsUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!verifyInternalApiKey(request))
    return sendErrorJson({
      status: 401,
      code: 'unauthorized',
      message: 'Internal authentication is required',
      request_id: extractRequestId(request),
    });
  try {
    const input = resolveConnectionQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const result = await getResolveToolConnectionsUseCase().execute(
      input,
      request.headers.get('x-sineva-context') ?? '',
    );
    return sendSuccessJson({
      data: result,
      message: 'Connection metadata resolved.',
      request_id: extractRequestId(request),
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
