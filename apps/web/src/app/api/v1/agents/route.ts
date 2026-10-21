import type { NextRequest } from 'next/server';
import {
  createAgentDtoSchema,
  listAgentsQuerySchema,
} from '@/server/application/dtos/agent_dto';
import { getGetAgentsUseCase } from '@/server/container';
import {
  extractRequestId,
  parseJsonBody,
  sendPaginatedJson,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = {
      page: searchParams.get('page') ?? undefined,
      per_page: searchParams.get('per_page') ?? undefined,
      category_filter: searchParams.get('category_filter') ?? undefined,
    };

    const validatedQuery = listAgentsQuerySchema.parse(rawQuery);
    const result = await getGetAgentsUseCase().execute(validatedQuery);

    return sendPaginatedJson({
      items: result.items,
      page: validatedQuery.page,
      per_page: validatedQuery.per_page,
      total_items: result.total_items,
      message: 'Specialized Sineva AI companions retrieved successfully',
      request_id: requestId,
    });
  },
  { scope: 'public', permission: 'specialist.view' },
);

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);
    const body = await parseJsonBody(request);
    const validatedInput = createAgentDtoSchema.parse(body);
    const createdAgent =
      await getGetAgentsUseCase().registerAgent(validatedInput);

    return sendSuccessJson({
      data: createdAgent,
      message: 'Custom AI companion registered successfully',
      status: 201,
      request_id: requestId,
    });
  },
  {
    scope: 'user',
    permission: 'specialist.enable',
    allowInternalApiKey: true,
    requiredRoleOrInternal: 'owner',
  },
);
