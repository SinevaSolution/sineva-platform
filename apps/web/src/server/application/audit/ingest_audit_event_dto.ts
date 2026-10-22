import { z } from 'zod';

// Lives next to the audit writer, not in `dtos/`: that folder holds the public
// request schemas, which the contract test forbids from naming `workspace_id`.
// This one is internal (X-Internal-Api-Key only) and has to name the tenant the
// event is about, because sineva-ai has no session to derive it from.
//
// `.strict()` so a body carrying `hash`, `prev_hash`, `id` or `occurred_at`
// fails with 422: the platform assigns those, the caller never does.
//
// `actor_type` is limited to `specialist` and `system`: sineva-ai holds the
// internal key but cannot mint a signed context, so it must not be able to
// write a row that says a user, support staff member or MCP client acted.
export const IngestAuditEventSchema = z
  .object({
    workspace_id: z.string().uuid().nullish(),
    actor_type: z.enum(['specialist', 'system']),
    actor_id: z.string().min(1).max(128),
    on_behalf_of_user_id: z.string().min(1).max(128).nullish(),
    action: z
      .string()
      .max(128)
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Use a dotted, lowercase action such as session.access_denied'),
    target_type: z.string().max(64).nullish(),
    target_id: z.string().max(128).nullish(),
    outcome: z.enum(['allowed', 'denied', 'error']).default('allowed'),
    reason_code: z.string().max(128).nullish(),
    request_id: z.string().max(128).nullish(),
    run_id: z.string().max(128).nullish(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  })
  .strict();

export type IngestAuditEventDto = z.infer<typeof IngestAuditEventSchema>;
