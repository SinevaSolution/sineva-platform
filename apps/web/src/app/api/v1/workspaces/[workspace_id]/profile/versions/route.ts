import type { NextRequest } from 'next/server';
import { getListProfileVersionsUseCase } from '@/server/container';
import { VersionListQuerySchema } from '@/server/application/dtos/business_profile_dto';
import { handleRouteError, searchParamsToObject, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// History is for the people who can change the profile (owner, admin): the diff
// and restore tools sit on top of it (FR-ONB-18).
export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = VersionListQuerySchema.parse(searchParamsToObject(request));
      const versions = await getListProfileVersionsUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        limit: query.limit,
        before: query.before,
      });
      return sendSuccessJson({
        data: { versions },
        message: 'Profile versions retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.update' },
);
