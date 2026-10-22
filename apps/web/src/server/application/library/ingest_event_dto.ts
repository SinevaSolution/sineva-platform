import { z } from 'zod';
import { LIBRARY_LANGUAGES } from '@/server/domain/library/library';

// Lives next to the Library use cases, not in `dtos/`: that folder holds the
// public request schemas, which may not name `workspace_id`. This one is
// internal (X-Internal-Api-Key only) and has to name the tenant the event is
// about, because sineva-ai has no session to derive it from. The use case
// checks that the tenant owns the document.
//
// `.strict()`: a body carrying `id`, `applied` or `created_at` fails with 422;
// the platform assigns those.
export const IngestEventSchema = z
  .object({
    event_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    document_id: z.string().uuid(),
    job_id: z.string().uuid(),
    /** Monotonic per job; the platform applies an event only if it is above the last applied one. */
    sequence: z.number().int().min(1),
    stage: z.enum(['received', 'parsing', 'ocr', 'chunking', 'embedding', 'indexing', 'completed', 'failed']),
    status: z.enum(['processing', 'ready', 'needs_attention', 'failed']),
    occurred_at: z.string().datetime({ offset: true }),
    progress: z
      .object({ current: z.number().int().min(0), total: z.number().int().min(1) })
      .nullish(),
    reason_code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).nullish(),
    pages: z.array(z.number().int().min(1)).max(200).default([]),
    page_count: z.number().int().min(0).nullish(),
    chunk_count: z.number().int().min(0).nullish(),
    language: z.enum(LIBRARY_LANGUAGES).nullish(),
    embedding_model: z.string().max(128).nullish(),
    ocr_pages: z.number().int().min(0).nullish(),
    personal_data_hint: z.boolean().default(false),
  })
  .strict();

export type IngestEventDto = z.infer<typeof IngestEventSchema>;

/**
 * What the apply use case consumes: an event from the callback, or a status
 * snapshot from a poll (no `event_id`, so no dedupe, and `occurred_at` is now).
 */
export interface IngestUpdate {
  event_id: string | null;
  tenant_id: string;
  document_id: string;
  job_id: string;
  sequence: number;
  stage: string;
  status: 'processing' | 'ready' | 'needs_attention' | 'failed';
  occurred_at: string;
  progress: { current: number; total: number } | null;
  reason_code: string | null;
  pages: number[];
  page_count: number | null;
  chunk_count: number | null;
  language: (typeof LIBRARY_LANGUAGES)[number] | null;
  embedding_model: string | null;
  ocr_pages: number | null;
  personal_data_hint: boolean;
}
