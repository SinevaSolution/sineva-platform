import type { NextRequest } from 'next/server';
import {
  createAgentDtoSchema,
  listAgentsQuerySchema,
} from '@/server/application/dtos/agent_dto';
import { getGetAgentsUseCase } from '@/server/container';
import {
  handleRouteError,
  sendPaginatedJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function GET(request: NextRequest) {
  try {
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
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const validatedInput = createAgentDtoSchema.parse(body);
    const createdAgent =
      await getGetAgentsUseCase().registerAgent(validatedInput);

    return sendSuccessJson({
      data: createdAgent,
      message: 'Custom AI companion registered successfully',
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
