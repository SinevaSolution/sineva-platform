import { z } from 'zod';
import { RUN_MODES, RUN_STATUSES } from '@/shared/workflows/run_state';

// Public request schemas of the Workflow routes (ADR-0045, ADR-0046). Identity
// and workspace come from the session and the URL; no schema names them.

export const WORKFLOW_NAME_MAX = 120;
export const WORKFLOW_DESCRIPTION_MAX = 500;
export const VERSION_NOTE_MAX = 280;
/** A draft is saved half finished, so this only bounds its size; the shared validator judges the rest. */
const DEFINITION_MAX_JSON_CHARS = 200_000;

export const DefinitionBodySchema = z
  .object({
    schema_version: z.number().int(),
    inputs: z.array(z.unknown()).max(30),
    steps: z.array(z.unknown()).max(40),
    outputs: z.array(z.unknown()).max(20),
    limits: z.record(z.string(), z.unknown()),
  })
  .refine((definition) => JSON.stringify(definition).length <= DEFINITION_MAX_JSON_CHARS, {
    message: 'definition is too large',
  });
export type DefinitionBody = z.infer<typeof DefinitionBodySchema>;

export const CreateWorkflowSchema = z
  .object({
    name: z.string().trim().min(1).max(WORKFLOW_NAME_MAX),
    description: z.string().trim().max(WORKFLOW_DESCRIPTION_MAX).nullish(),
    definition: DefinitionBodySchema.optional(),
  })
  .strict();
export type CreateWorkflowDto = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z
  .object({
    name: z.string().trim().min(1).max(WORKFLOW_NAME_MAX).optional(),
    description: z.string().trim().max(WORKFLOW_DESCRIPTION_MAX).nullish(),
    definition: DefinitionBodySchema.optional(),
    /** The revision the editor loaded; a stale one is a 409. */
    expected_revision: z.number().int().min(1),
  })
  .strict();
export type UpdateWorkflowDto = z.infer<typeof UpdateWorkflowSchema>;

export const PublishWorkflowSchema = z
  .object({
    note: z.string().trim().max(VERSION_NOTE_MAX).nullish(),
    expected_revision: z.number().int().min(1).optional(),
  })
  .strict();
export type PublishWorkflowDto = z.infer<typeof PublishWorkflowSchema>;

export const RestoreWorkflowSchema = z
  .object({ note: z.string().trim().max(VERSION_NOTE_MAX).nullish() })
  .strict();
export type RestoreWorkflowDto = z.infer<typeof RestoreWorkflowSchema>;

export const ListWorkflowsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['draft', 'published', 'archived', 'needs_attention']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListWorkflowsQuery = z.infer<typeof ListWorkflowsQuerySchema>;

const LOCALES = ['en', 'id'] as const;

export const ListWorkflowTemplatesQuerySchema = z.object({
  locale: z.enum(LOCALES).default('en'),
});

export const UseWorkflowTemplateSchema = z
  .object({
    locale: z.enum(LOCALES).default('en'),
    name: z.string().trim().min(1).max(WORKFLOW_NAME_MAX).optional(),
  })
  .strict();
export type UseWorkflowTemplateDto = z.infer<typeof UseWorkflowTemplateSchema>;

const inputValue = z.union([z.string().max(4000), z.number(), z.null(), z.array(z.string().max(64)).max(25)]);

export const StartWorkflowRunSchema = z
  .object({
    mode: z.enum(RUN_MODES),
    inputs: z.record(z.string().max(32), inputValue).default({}),
    /** Language of what the run writes; the person's UI language when the screen knows it. */
    locale: z.enum(LOCALES).optional(),
  })
  .strict();
export type StartWorkflowRunDto = z.infer<typeof StartWorkflowRunSchema>;

export const ResumeWorkflowRunSchema = z
  .object({ mode: z.enum(['from_failed_step', 'continue_after_budget']) })
  .strict();
export type ResumeWorkflowRunDto = z.infer<typeof ResumeWorkflowRunSchema>;

export const ListWorkflowRunsQuerySchema = z.object({
  workflow_id: z.string().uuid().optional(),
  status: z.enum(RUN_STATUSES).optional(),
  mode: z.enum(RUN_MODES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListWorkflowRunsQuery = z.infer<typeof ListWorkflowRunsQuerySchema>;
