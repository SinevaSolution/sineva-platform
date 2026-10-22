import type { NextRequest } from 'next/server';
import { getDeleteProfileScanUseCase, getGetProfileScanUseCase } from '@/server/container';
import { UuidParamSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string; scan_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const scanId = UuidParamSchema.parse(params?.scan_id);
      const scan = await getGetProfileScanUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        scan_id: scanId,
      });
      return sendSuccessJson({
        data: { scan },
        message: 'Website scan retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.scan' },
);

// Drops the suggestions. The request still counts toward the hourly limit.
export const DELETE = withAuth<{ workspace_id: string; scan_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const scanId = UuidParamSchema.parse(params?.scan_id);
      await getDeleteProfileScanUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        scan_id: scanId,
      });
      return sendSuccessJson({
        data: { scan_id: scanId },
        message: 'Website scan discarded.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.scan' },
);
