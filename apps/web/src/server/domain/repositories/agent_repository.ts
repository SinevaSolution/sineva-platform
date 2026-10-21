import type { AgentCategory, AgentEntity } from '../entities/agent';

export interface ListAgentsQuery {
  page: number;
  per_page: number;
  category_filter?: AgentCategory;
}

export interface PaginatedAgentsResult {
  items: AgentEntity[];
  total_items: number;
}

export interface CreateAgentInput {
  agent_slug: string;
  display_name: string;
  role_title: string;
  category: AgentCategory;
  short_description: string;
  capabilities: string[];
  model_name: string;
}

export interface AgentRepository {
  findAll(query: ListAgentsQuery): Promise<PaginatedAgentsResult>;
  findBySlug(agent_slug: string): Promise<AgentEntity | null>;
  create(input: CreateAgentInput): Promise<AgentEntity>;
}
