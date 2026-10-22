import { z } from 'zod';
import { OUTPUT_PREVIEW_MAX, RUN_STATUSES, STEP_STATUSES } from '@/shared/workflows/run_state';

// Body of `POST /api/internal/v1/workflow-runs/events` (ADR-0046 point 2).
// sineva-ai holds the internal key but no session, so every id in here is a
// claim that the use case checks against the stored run.

const iso = z.string().datetime({ offset: true });
const count = z.number().int().min(0);
const code = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const progress = z.object({ current: count, total: z.number().int().min(1) }).nullable();

const envelopeFields = {
  event_id: z.string().min(8).max(64),
  tenant_id: z.string().uuid(),
  run_id: z.string().uuid(),
  sequence: z.number().int().min(1),
  occurred_at: iso,
};

const runStatusEvent = z.object({
  ...envelopeFields,
  type: z.literal('run_status'),
  data: z.object({
    status: z.enum(RUN_STATUSES),
    credits_used: count.optional(),
    error_code: code.nullable().optional(),
    started_at: iso.nullable().optional(),
    finished_at: iso.nullable().optional(),
  }),
});

const stepKey = z.string().min(1).max(64);
const stepType = z.string().min(1).max(32);

const stepStartedEvent = z.object({
  ...envelopeFields,
  type: z.literal('step_started'),
  data: z.object({
    step_key: stepKey,
    step_type: stepType,
    position: count,
    attempt: z.number().int().min(1),
    progress: progress.optional(),
  }),
});

const stepCompletedEvent = z.object({
  ...envelopeFields,
  type: z.literal('step_completed'),
  data: z.object({
    step_key: stepKey,
    step_type: stepType,
    position: count,
    status: z.enum(STEP_STATUSES),
    attempt: z.number().int().min(1),
    credits: count,
    output_preview: z.string().max(OUTPUT_PREVIEW_MAX).nullable(),
    error_code: code.nullable(),
    approval_id: z.string().uuid().nullable(),
    progress: progress.optional(),
  }),
});

export const WorkflowRunEventSchema = z.discriminatedUnion('type', [
  runStatusEvent,
  stepStartedEvent,
  stepCompletedEvent,
]);
export type WorkflowRunEvent = z.infer<typeof WorkflowRunEventSchema>;
