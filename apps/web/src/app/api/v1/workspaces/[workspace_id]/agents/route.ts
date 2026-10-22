import type { NextRequest } from 'next/server';
import { listAgentsQuerySchema } from '@/server/application/dtos/agent_dto';
import { getListWorkspaceSpecialistsUseCase } from '@/server/container';
import { handleRouteError, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = listAgentsQuerySchema.parse({
        category_filter: request.nextUrl.searchParams.get('category_filter') ?? undefined,
      });
      const roster = await getListWorkspaceSpecialistsUseCase().execute(query, requestContext);

      return sendSuccessJson({
        data: roster,
        message: 'Specialists retrieved successfully',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'specialist.view' },
);
