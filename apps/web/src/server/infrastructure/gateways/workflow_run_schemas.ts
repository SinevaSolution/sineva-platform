import 'server-only';
import { z } from 'zod';
import { RUN_STATUSES, STEP_STATUSES, OUTPUT_PREVIEW_MAX } from '@/shared/workflows/run_state';

// Zod readers of what sineva-ai answers to the Workflow run calls. The fixtures
// `workflow_run_*.json` are the contract (proposed by the platform, pending
// sineva-ai, ADR-0046); this file is the platform's reader. Objects are not
// `.strict()`: additive fields from sineva-ai are tolerated, a missing or
// mistyped one is a contract violation (502).

const iso = z.string().datetime({ offset: true });
const count = z.number().int().min(0);
const code = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ success: z.literal(true), data });

export const runStatusSchema = z.enum(RUN_STATUSES);
export const stepStatusSchema = z.enum(STEP_STATUSES);

export const runAcceptedSchema = z.object({
  run_id: z.string().uuid(),
  status: runStatusSchema,
});

export const stepSnapshotSchema = z.object({
  step_key: z.string().min(1).max(64),
  step_type: z.string().min(1).max(32),
  position: count,
  status: stepStatusSchema,
  attempt: z.number().int().min(1),
  progress: z.object({ current: count, total: z.number().int().min(1) }).nullable(),
  output_preview: z.string().max(OUTPUT_PREVIEW_MAX).nullable(),
  error_code: code.nullable(),
  credits: count,
  approval_id: z.string().uuid().nullable(),
  started_at: iso.nullable(),
  finished_at: iso.nullable(),
});

export const runSnapshotSchema = z.object({
  run_id: z.string().uuid(),
  status: runStatusSchema,
  credits_used: count,
  error_code: code.nullable(),
  started_at: iso.nullable(),
  finished_at: iso.nullable(),
  last_sequence: count,
  steps: z.array(stepSnapshotSchema).max(64),
});
