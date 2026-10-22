import type { NextRequest } from 'next/server';
import { getCreateOfferingUseCase, getGetBusinessProfileUseCase } from '@/server/container';
import { OfferingCreateSchema } from '@/server/application/dtos/business_profile_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const result = await getGetBusinessProfileUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
      });
      return sendSuccessJson({
        data: { offerings: result.offerings },
        message: 'Offerings retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.view' },
);

export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const input = OfferingCreateSchema.parse(await parseJsonBody(request));
      const result = await getCreateOfferingUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        input,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Offering created successfully.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);
