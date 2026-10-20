import type { NextRequest } from 'next/server';
import {
  createAgentDtoSchema,
  listAgentsQuerySchema,
} from '@/application/dtos/agent_dto';
import { GetAgentsUseCase } from '@/application/use-cases/get_agents_use_case';
import { defaultCacheRepository } from '@/infrastructure/cache/redis_cache_repository';
import { defaultAgentRepository } from '@/infrastructure/database/client';
import {
  handleRouteError,
  sendPaginatedJson,
  sendSuccessJson,
} from '@/presentation/http/response_helper';

const getAgentsUseCase = new GetAgentsUseCase(
  defaultAgentRepository,
  defaultCacheRepository,
);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = {
      page: searchParams.get('page') ?? undefined,
      per_page: searchParams.get('per_page') ?? undefined,
      category_filter: searchParams.get('category_filter') ?? undefined,
    };

    const validatedQuery = listAgentsQuerySchema.parse(rawQuery);
    const result = await getAgentsUseCase.execute(validatedQuery);

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
    const createdAgent = await getAgentsUseCase.registerAgent(validatedInput);

    return sendSuccessJson({
      data: createdAgent,
      message: 'Custom AI companion registered successfully',
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
