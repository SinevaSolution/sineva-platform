import { z } from 'zod';

// Public request schemas for the Inbox. None names `workspace_id` or
// `user_id`: both come from the session and the URL (R-27). Bodies are
// `.strict()` so an unknown key is a 422, not silently ignored.

const SLUG = /^[a-z][a-z0-9_]{0,63}$/;

export const ListInboxQuerySchema = z.object({
  // `ideas` is not a tab yet; asking for it is a 422 rather than an empty page.
  tab: z.enum(['needs_review', 'needs_input', 'done']).optional(),
  agent_slug: z.string().regex(SLUG).optional(),
  cursor: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListInboxQueryDto = z.infer<typeof ListInboxQuerySchema>;

export const DecideApprovalSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    version: z.number().int().min(1),
    note: z.string().max(1000).optional(),
    edited_payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type DecideApprovalDto = z.infer<typeof DecideApprovalSchema>;

export const RequestChangesSchema = z
  .object({
    version: z.number().int().min(1),
    instruction: z.string().trim().min(1).max(1000),
  })
  .strict();
export type RequestChangesDto = z.infer<typeof RequestChangesSchema>;

export const AnswerInputSchema = z
  .object({
    version: z.number().int().min(1),
    answers: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AnswerInputDto = z.infer<typeof AnswerInputSchema>;
