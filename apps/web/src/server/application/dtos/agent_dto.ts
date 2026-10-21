import { z } from 'zod';
import { paginationQuerySchema } from './pagination_dto';

export const agentCategorySchema = z.enum([
  'people_hr',
  'finance_ops',
  'sales_growth',
  'social_marketing',
  'customer_support',
  'data_insights',
]);

export const listAgentsQuerySchema = paginationQuerySchema.extend({
  category_filter: agentCategorySchema.optional(),
});

export const createAgentDtoSchema = z.object({
  agent_slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'agent_slug must be lowercase alphanumeric or hyphenated'),
  display_name: z.string().min(2).max(80),
  role_title: z.string().min(2).max(120),
  category: agentCategorySchema,
  short_description: z.string().min(10).max(400),
  capabilities: z.array(z.string().min(2)).min(1),
  model_name: z.string().min(2).max(80).default('sineva-core-v2'),
});

export type ListAgentsQueryDto = z.infer<typeof listAgentsQuerySchema>;
export type CreateAgentDto = z.infer<typeof createAgentDtoSchema>;
