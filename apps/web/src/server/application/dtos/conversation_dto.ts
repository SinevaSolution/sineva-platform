import { z } from 'zod';
import { CANONICAL_SPECIALIST_SLUGS } from '@/server/domain/chat/specialist_catalog';

export const CreateConversationSchema = z
  .object({
    kind: z.enum(['hub', 'room']),
    agent_slug: z.string().optional().nullable(),
    title: z.string().max(255).optional().nullable(),
    title_source: z.enum(['user', 'auto', 'first_message']).optional().nullable(),
    origin_message_id: z.string().uuid().optional().nullable(),
    origin_channel: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'room') {
      if (!data.agent_slug) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Room conversations require a pinned specialist agent_slug',
          path: ['agent_slug'],
        });
      } else if (!CANONICAL_SPECIALIST_SLUGS.has(data.agent_slug.toLowerCase().trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown specialist agent_slug: ${data.agent_slug}`,
          path: ['agent_slug'],
        });
      }
    } else if (data.kind === 'hub' && data.agent_slug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hub conversations cannot pin an agent_slug',
        path: ['agent_slug'],
      });
    }
  });

export type CreateConversationDto = z.infer<typeof CreateConversationSchema>;

export const CreateMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content cannot be empty')
    .max(8000, 'Message content cannot exceed 8,000 characters'),
  client_message_id: z.string().max(255).optional().nullable(),
  mentions: z
    .array(
      z.object({
        agent_slug: z.string(),
      }),
    )
    .optional()
    .nullable(),
});

export type CreateMessageDto = z.infer<typeof CreateMessageSchema>;

export const ListConversationsQuerySchema = z.object({
  kind: z.enum(['hub', 'room']).optional(),
  agent_slug: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type ListConversationsQueryDto = z.infer<typeof ListConversationsQuerySchema>;

export const ListMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type ListMessagesQueryDto = z.infer<typeof ListMessagesQuerySchema>;
