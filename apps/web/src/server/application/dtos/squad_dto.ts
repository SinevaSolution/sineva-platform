import { z } from 'zod';
import { SQUAD_GOAL_MAX, SQUAD_MEMBERS_MAX, SQUAD_NAME_MAX } from '@/server/domain/squads/squad';

// Public request schemas of the squad routes. Identity and workspace come from
// the session and the URL; no schema here names them (R-27). Member counts are
// checked by the domain, which names the limit and the count; the schemas only
// bound the array so a huge list never reaches it.

const slug = z.string().trim().min(1).max(32);
const name = z.string().trim().min(1).max(SQUAD_NAME_MAX);
const goal = z.string().trim().min(1).max(SQUAD_GOAL_MAX);
const members = z.array(slug).max(SQUAD_MEMBERS_MAX + 5);

export const CreateSquadSchema = z
  .object({
    name,
    goal,
    member_slugs: members,
    lead_type: z.enum(['sino', 'member']).default('sino'),
    lead_agent_slug: slug.nullish(),
    template_slug: z.string().trim().min(1).max(40).nullish(),
  })
  .strict();
export type CreateSquadDto = z.infer<typeof CreateSquadSchema>;

export const UpdateSquadSchema = z
  .object({
    name: name.optional(),
    goal: goal.optional(),
    lead_type: z.enum(['sino', 'member']).optional(),
    lead_agent_slug: slug.nullable().optional(),
    /** `archived` archives; `active` restores. Deleting is the DELETE route. */
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
export type UpdateSquadDto = z.infer<typeof UpdateSquadSchema>;

export const SetSquadMembersSchema = z
  .object({
    member_slugs: members,
    lead_type: z.enum(['sino', 'member']).optional(),
    lead_agent_slug: slug.nullable().optional(),
  })
  .strict();
export type SetSquadMembersDto = z.infer<typeof SetSquadMembersSchema>;

export const UseSquadTemplateSchema = z
  .object({
    name: name.optional(),
    goal: goal.optional(),
  })
  .strict();
export type UseSquadTemplateDto = z.infer<typeof UseSquadTemplateSchema>;

export const SetSquadAccessSchema = z
  .object({
    user_id: z.string().uuid(),
    granted: z.boolean(),
  })
  .strict();
export type SetSquadAccessDto = z.infer<typeof SetSquadAccessSchema>;

export const ListSquadsQuerySchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
});
export type ListSquadsQueryDto = z.infer<typeof ListSquadsQuerySchema>;

export const CreateSquadSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).nullish(),
  })
  .strict();
export type CreateSquadSessionDto = z.infer<typeof CreateSquadSessionSchema>;

export const CreateSquadMessageSchema = z
  .object({
    content: z.string().min(1, 'Message content cannot be empty').max(8000, 'Message content cannot exceed 8,000 characters'),
    client_message_id: z.string().max(255).nullish(),
  })
  .strict();
export type CreateSquadMessageDto = z.infer<typeof CreateSquadMessageSchema>;

export const SquadActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type SquadActivityQueryDto = z.infer<typeof SquadActivityQuerySchema>;

// ---------------------------------------------------------------------------
// Squad events from sineva-ai (proposed contract, ADR-0044). Validated by the
// relay; a payload that does not fit is dropped with a log line.
// ---------------------------------------------------------------------------

export const squadHandoffEventSchema = z.object({
  delegation_id: z.string().min(1).max(64),
  from: z.string().min(1).max(32),
  to: z.string().min(1).max(32),
  task_summary: z.string().min(1).max(500),
  parallel_group: z.number().int().nonnegative().nullable().optional(),
});

export const squadHandoffResultEventSchema = z.object({
  delegation_id: z.string().min(1).max(64),
  to: z.string().min(1).max(32).optional(),
  status: z.enum(['done', 'needs_review', 'failed']),
  summary: z.string().max(2000).nullable().optional(),
  error_code: z.string().max(64).nullable().optional(),
  points: z.number().nonnegative().nullable().optional(),
});

export const SQUAD_CAPS = ['cap_delegations', 'cap_tokens', 'cap_time', 'cap_credits'] as const;

export const squadTurnLimitEventSchema = z.object({
  cap: z.enum(SQUAD_CAPS),
  unfinished: z.array(z.string().max(500)).max(20).default([]),
});

export const squadDoneExtrasSchema = z.object({
  termination_reason: z.string().max(32).optional(),
  delegation_count: z.number().int().nonnegative().optional(),
  points: z.number().nonnegative().optional(),
  contributors: z.array(z.string().max(32)).max(10).optional(),
});
