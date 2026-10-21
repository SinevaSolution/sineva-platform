import 'server-only';
import type {
  AgentCategory,
  AgentEntity,
  AgentStatus,
} from '@/server/domain/entities/agent';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type {
  AgentRepository,
  CreateAgentInput,
  ListAgentsQuery,
  PaginatedAgentsResult,
} from '@/server/domain/repositories/agent_repository';
import { Prisma, type AgentConfig, type PrismaClient } from './generated/client';

// `Record<Union, true>` rather than an array: adding a member to the domain
// union makes this fail to compile until the adapter learns about it, instead
// of silently rejecting valid rows at runtime.
const AGENT_CATEGORIES: Record<AgentCategory, true> = {
  people_hr: true,
  finance_ops: true,
  sales_growth: true,
  social_marketing: true,
  customer_support: true,
  data_insights: true,
};

const AGENT_STATUSES: Record<AgentStatus, true> = {
  online: true,
  standby: true,
  busy: true,
  maintenance: true,
};

// The DB columns are free-form `text`/`jsonb`, so nothing stops another writer
// (sineva-ai, a manual fix) from storing a value the domain does not know.
// Throwing surfaces that corruption at the boundary; a blind cast would let
// it flow into the UI as an impossible `AgentCategory`.
function toCategory(value: string, slug: string): AgentCategory {
  if (!Object.hasOwn(AGENT_CATEGORIES, value)) {
    throw new Error(`Agent '${slug}' has unknown category '${value}'`);
  }
  return value as AgentCategory;
}

function toStatus(value: string, slug: string): AgentStatus {
  if (!Object.hasOwn(AGENT_STATUSES, value)) {
    throw new Error(`Agent '${slug}' has unknown status '${value}'`);
  }
  return value as AgentStatus;
}

function toCapabilities(value: Prisma.JsonValue, slug: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item): item is string => typeof item === 'string')
  ) {
    throw new Error(`Agent '${slug}' has capabilities that are not string[]`);
  }
  return value;
}

function toEntity(row: AgentConfig): AgentEntity {
  return {
    id: row.id,
    agent_slug: row.agent_slug,
    display_name: row.display_name,
    role_title: row.role_title,
    category: toCategory(row.category, row.agent_slug),
    status: toStatus(row.status, row.agent_slug),
    short_description: row.short_description,
    capabilities: toCapabilities(row.capabilities, row.agent_slug),
    model_name: row.model_name,
    avg_latency_ms: row.avg_latency_ms,
    active_sessions_count: row.active_sessions_count,
    daily_tokens_used: row.daily_tokens_used,
    accent_token: row.accent_token,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAll(query: ListAgentsQuery): Promise<PaginatedAgentsResult> {
    const where = query.category_filter
      ? { category: query.category_filter }
      : undefined;

    // One transaction so the page and the total describe the same snapshot.
    const [rows, total_items] = await this.db.$transaction([
      this.db.agentConfig.findMany({
        where,
        // Postgres returns rows in no defined order; without this, pages could
        // overlap or skip rows. `id` breaks ties between equal timestamps.
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
      }),
      this.db.agentConfig.count({ where }),
    ]);

    return { items: rows.map(toEntity), total_items };
  }

  async findBySlug(agent_slug: string): Promise<AgentEntity | null> {
    const row = await this.db.agentConfig.findUnique({ where: { agent_slug } });
    return row ? toEntity(row) : null;
  }

  async create(input: CreateAgentInput): Promise<AgentEntity> {
    try {
      const row = await this.db.agentConfig.create({
        data: {
          agent_slug: input.agent_slug,
          display_name: input.display_name,
          role_title: input.role_title,
          category: input.category,
          short_description: input.short_description,
          capabilities: input.capabilities,
          model_name: input.model_name,
          // Initial runtime state of a freshly registered agent. These are
          // business defaults living in infrastructure, kept identical to the
          // former in-memory repository; they belong in a domain factory.
          status: 'online',
          avg_latency_ms: 350,
          active_sessions_count: 1,
          daily_tokens_used: 0,
          accent_token: '--teal-500',
        },
      });
      return toEntity(row);
    } catch (error) {
      // Rely on the unique index rather than a find-then-insert check, which
      // would race under concurrent registrations of the same slug.
      if (isUniqueViolation(error)) {
        throw new ConflictError('Agent', input.agent_slug);
      }
      throw error;
    }
  }
}
