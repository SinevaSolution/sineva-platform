import type { NextRequest } from 'next/server';
import { getRestoreProfileVersionUseCase } from '@/server/container';
import { VersionParamSchema } from '@/server/application/dtos/business_profile_dto';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// No body: the version is in the path. A restore writes a NEW version.
export const POST = withAuth<{ workspace_id: string; version: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const version = VersionParamSchema.parse(params?.version);
      const result = await getRestoreProfileVersionUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        version,
        context: requestContext,
      });
      return sendSuccessJson({
        data: result,
        message: 'Profile version restored successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);
