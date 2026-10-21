import type { NextRequest } from 'next/server';
import { getSystemHealthUseCase } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function GET(request?: NextRequest) {
  try {
    const requestId = extractRequestId(request);
    const healthData = await getSystemHealthUseCase().execute();
    return sendSuccessJson({
      data: healthData,
      message: 'Sineva platform and shared infrastructure health verified',
      status: 200,
      request_id: requestId,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
