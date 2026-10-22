import type { NextRequest } from 'next/server';
import { getSystemHealthUseCase } from '@/server/container';
import {
  extractRequestId,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth(
  async (request?: NextRequest, context?: { requestContext?: { staff_role?: string | null } }) => {
    const requestId = extractRequestId(request);
    const healthData = await getSystemHealthUseCase().execute();

    // SEC-7 & WP-M0-22: Authenticated staff (operator/admin) requesting full health
    // see detailed topology. Default public caller receives { status } only, masking internal URLs.
    const isStaff =
      request?.headers?.get('x-staff-health') === 'true' &&
      (context?.requestContext?.staff_role === 'operator' ||
        context?.requestContext?.staff_role === 'platform_admin');
    const responseData = isStaff ? healthData : { status: healthData.status };

    if (healthData.status !== 'healthy') {
      return sendErrorJson({
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
      });
    }

    return sendSuccessJson({
      data: responseData,
      message: 'Sineva platform and shared infrastructure health verified',
      status: 200,
      request_id: requestId,
    });
  },
  { scope: 'public' },
);
