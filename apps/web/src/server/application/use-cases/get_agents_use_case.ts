import type { AgentEntity } from '@/server/domain/entities/agent';
import type {
  AgentRepository,
  CreateAgentInput,
  ListAgentsQuery,
  PaginatedAgentsResult,
} from '@/server/domain/repositories/agent_repository';
import type { CacheRepository } from '@/server/domain/repositories/cache_repository';

export class GetAgentsUseCase {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly cacheRepository: CacheRepository,
  ) {}

  async execute(query: ListAgentsQuery): Promise<PaginatedAgentsResult> {
    const cacheKey = `agents:list:p_${query.page}:pp_${query.per_page}:cat_${query.category_filter ?? 'all'}`;
    const cached = await this.cacheRepository.get<PaginatedAgentsResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.agentRepository.findAll(query);
    await this.cacheRepository.set(cacheKey, result, 30);
    return result;
  }

  async registerAgent(input: CreateAgentInput): Promise<AgentEntity> {
    const created = await this.agentRepository.create(input);
    await this.cacheRepository.del('agents:list:p_1:pp_10:cat_all');
    return created;
  }
}
