import { z } from 'zod';
import { AGENT_CATEGORIES } from '@/server/domain/specialists/agent_catalog';

// Built from the domain list, which follows the sineva-ai category enum, so
// the route, the gateway schema and the types cannot drift apart.
export const agentCategorySchema = z.enum(AGENT_CATEGORIES);

// The roster is at most a few dozen entries and is returned whole: there is no
// page or per_page. Identity (workspace) comes from the URL, never the query.
export const listAgentsQuerySchema = z.object({
  category_filter: agentCategorySchema.optional(),
});

export type ListAgentsQueryDto = z.infer<typeof listAgentsQuerySchema>;
