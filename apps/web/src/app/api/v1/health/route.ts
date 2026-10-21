import type { NextRequest } from 'next/server';
import { getSystemHealthUseCase } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function GET(request?: NextRequest) {
  try {
    const requestId = extractRequestId(request);
    const healthData = await getSystemHealthUseCase().execute();

    // SEC-7: For unauthenticated callers (and until WP-M0-22 adds platform role auth),
    // public health returns { status } only, masking internal URLs, bucket names, and subsystems.
    const isPublic = true;
    const responseData = isPublic ? { status: healthData.status } : healthData;

    if (healthData.status !== 'healthy') {
      return sendErrorJson(
        {
          data: responseData,
          status: 503,
          code: 'dependency_unavailable',
          message:
            'One or more required infrastructure subsystems are in standby or unavailable',
          request_id: requestId,
          errors: [
            {
              code: 'dependency_unavailable',
              field: null,
              detail: 'System health probe detected degraded subsystem status',
            },
          ],
        },
      );
    }

    return sendSuccessJson({
      data: responseData,
      message: 'Sineva platform and shared infrastructure health verified',
      status: 200,
      request_id: requestId,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
