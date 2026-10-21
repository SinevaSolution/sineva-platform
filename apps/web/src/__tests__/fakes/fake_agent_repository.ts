import type { AgentEntity } from '@/server/domain/entities/agent';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type {
  AgentRepository,
  CreateAgentInput,
  ListAgentsQuery,
  PaginatedAgentsResult,
} from '@/server/domain/repositories/agent_repository';

export function buildAgentEntity(
  overrides: Partial<AgentEntity> & Pick<AgentEntity, 'agent_slug'>,
): AgentEntity {
  return {
    id: `agt_fake_${overrides.agent_slug}`,
    display_name: overrides.agent_slug,
    role_title: 'Fake role',
    category: 'data_insights',
    status: 'online',
    short_description: 'Fixture agent used by unit tests.',
    capabilities: ['fixture_capability'],
    model_name: 'fake-model',
    avg_latency_ms: 100,
    active_sessions_count: 0,
    daily_tokens_used: 0,
    accent_token: '--teal-500',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

/** One agent per category, mirroring the real catalogue's shape. */
export function buildDefaultAgentFixtures(): AgentEntity[] {
  return [
    buildAgentEntity({
      agent_slug: 'sinopeople',
      display_name: 'SinoPeople',
      category: 'people_hr',
    }),
    buildAgentEntity({
      agent_slug: 'sinofinance',
      display_name: 'SinoFinance',
      category: 'finance_ops',
    }),
    buildAgentEntity({
      agent_slug: 'sinosales',
      display_name: 'SinoSales',
      category: 'sales_growth',
    }),
    buildAgentEntity({
      agent_slug: 'sinosocial',
      display_name: 'SinoSocial',
      category: 'social_marketing',
    }),
    buildAgentEntity({
      agent_slug: 'sinohelp',
      display_name: 'SinoHelp',
      category: 'customer_support',
    }),
    buildAgentEntity({
      agent_slug: 'sinoinsights',
      display_name: 'SinoInsights',
      category: 'data_insights',
    }),
  ];
}

export class FakeAgentRepository implements AgentRepository {
  public findAllCalls = 0;
  private readonly agents: Map<string, AgentEntity>;

  constructor(seed: AgentEntity[] = buildDefaultAgentFixtures()) {
    this.agents = new Map(seed.map((agent) => [agent.agent_slug, agent]));
  }

  async findAll(query: ListAgentsQuery): Promise<PaginatedAgentsResult> {
    this.findAllCalls += 1;
    const all = Array.from(this.agents.values());
    const filtered = query.category_filter
      ? all.filter((agent) => agent.category === query.category_filter)
      : all;
    const start = (query.page - 1) * query.per_page;
    return {
      items: filtered.slice(start, start + query.per_page),
      total_items: filtered.length,
    };
  }

  async findBySlug(agent_slug: string): Promise<AgentEntity | null> {
    return this.agents.get(agent_slug) ?? null;
  }

  async create(input: CreateAgentInput): Promise<AgentEntity> {
    // Same contract as the Postgres adapter: slugs are unique.
    if (this.agents.has(input.agent_slug)) {
      throw new ConflictError('Agent', input.agent_slug);
    }
    const entity = buildAgentEntity(input);
    this.agents.set(entity.agent_slug, entity);
    return entity;
  }
}
