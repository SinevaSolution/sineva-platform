import { z } from 'zod';

// The proposed approval contract between sineva-ai and the platform
// (ADR-0032). Fixtures: `__tests__/contract/fixtures/approval_*.json`.
// Readers tolerate additive fields (no `.strict()` on what sineva-ai sends us
// in a stream); the internal HTTP bodies are strict because we own those.

const ACTION_KIND = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

export const inputFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  type: z.enum(['text', 'choice', 'boolean', 'number']),
  label: z.string().min(1).max(200),
  required: z.boolean(),
  choices: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
});

const approvalFields = {
  approval_id: z.string().uuid(),
  revision: z.number().int().min(1).default(1),
  action_kind: z.string().max(64).regex(ACTION_KIND),
  tool_name: z.string().max(64).regex(TOOL_NAME),
  agent_slug: z.string().min(1).max(64).optional(),
  draft_summary: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
  expires_at: z.string().datetime({ offset: true }).nullish(),
  guardrail_reason: z.string().max(128).nullable().default(null),
  card_id: z.string().min(1).max(128).optional(),
};

const inputFields = {
  input_request_id: z.string().uuid(),
  agent_slug: z.string().min(1).max(64).optional(),
  question: z.string().min(1).max(500),
  fields: z.array(inputFieldSchema).max(8),
  expires_at: z.string().datetime({ offset: true }).nullish(),
};

/** `data` of the SSE event `approval_required`. */
export const approvalRequiredEventSchema = z.object(approvalFields);
export type ApprovalRequiredEvent = z.infer<typeof approvalRequiredEventSchema>;

/** `data` of the SSE event `input_required`. */
export const inputRequiredEventSchema = z.object(inputFields);
export type InputRequiredEvent = z.infer<typeof inputRequiredEventSchema>;

const internalScope = {
  workspace_id: z.string().uuid(),
  /** The platform run handle (`run_<uuid>`), the `run_id` of the signed context. */
  run_id: z.string().regex(/^run_[0-9a-f-]{36}$/i),
};

/** Body of `POST /internal/v1/approvals`. */
export const createApprovalRequestSchema = z.object({ ...internalScope, ...approvalFields }).strict();
export type CreateApprovalRequest = z.infer<typeof createApprovalRequestSchema>;

/** Body of `POST /internal/v1/input-requests`. */
export const createInputRequestRequestSchema = z.object({ ...internalScope, ...inputFields }).strict();
export type CreateInputRequestRequest = z.infer<typeof createInputRequestRequestSchema>;

const PAYLOAD_HASH = /^sha256:[0-9a-f]{64}$/;

/** Body of the platform's resume call for an approval. */
export const resumeApprovalBodySchema = z
  .object({
    kind: z.literal('approval'),
    approval_id: z.string().uuid(),
    revision: z.number().int().min(1),
    decision: z.enum(['approved', 'rejected', 'changes_requested', 'expired']),
    decided_at: z.string().datetime({ offset: true }),
    payload_hash: z.string().regex(PAYLOAD_HASH),
    edited: z.boolean(),
    instruction: z.string().max(1000).optional(),
    note: z.string().max(1000).optional(),
    result: z.object({ executed: z.boolean() }),
  })
  .strict();

/** Body of the platform's resume call for an input request. */
export const resumeInputBodySchema = z
  .object({
    kind: z.literal('input_request'),
    input_request_id: z.string().uuid(),
    decision: z.enum(['answered', 'dismissed', 'expired']),
    decided_at: z.string().datetime({ offset: true }),
    answers: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const resumeRunBodySchema = z.discriminatedUnion('kind', [
  resumeApprovalBodySchema,
  resumeInputBodySchema,
]);

export const resumeRunResponseSchema = z.object({
  status: z.enum(['resumed', 'already_resumed']),
});
