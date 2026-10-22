import 'server-only';
import { z } from 'zod';
import { LIBRARY_LANGUAGES } from '@/server/domain/library/library';

// Zod schemas of the answers sineva-ai gives to the Library calls. The fixtures
// `library_*.json` are the contract (proposed by the platform, pending
// sineva-ai, ADR-0030); this file is the platform's reader. Objects are not
// `.strict()`: additive fields from sineva-ai are tolerated, a missing or
// mistyped one is a contract violation (502).

const uuid = z.string().uuid();
const count = z.number().int().min(0);
const reasonCode = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ success: z.literal(true), data });

export const ingestAcceptedSchema = z.object({
  job_id: uuid,
  status: z.enum(['queued', 'processing']),
});

export const ingestStatusSchema = z.object({
  job_id: uuid,
  document_id: uuid,
  status: z.enum(['queued', 'processing', 'ready', 'needs_attention', 'failed']),
  sequence: count,
  stage: z.string().min(1).max(32),
  progress: z.object({ current: count, total: z.number().int().min(1) }).nullable(),
  page_count: count.nullable(),
  chunk_count: count.nullable(),
  language: z.enum(LIBRARY_LANGUAGES).nullable(),
  embedding_model: z.string().max(128).nullable(),
  ocr_pages: count.nullable(),
  reason_code: reasonCode.nullable(),
  pages: z.array(z.number().int().min(1)).max(200),
  personal_data_hint: z.boolean(),
});

export const aclUpdateReportSchema = z.object({
  document_id: uuid,
  acl: z.array(z.string()),
  chunks_updated: count,
  re_embedded: z.boolean(),
});

export const deleteReportSchema = z.object({
  document_id: uuid,
  files_deleted: count,
  text_deleted: z.boolean(),
  chunks_deleted: count,
  vectors_deleted: count,
  vectors_remaining: count,
  verified: z.boolean(),
});

export const searchResultSchema = z.object({
  results: z.array(
    z.object({
      document_id: uuid,
      chunk_id: z.string().min(1).max(128),
      page: z.number().int().min(1).nullable(),
      section_path: z.string().nullable(),
      snippet: z.string(),
      source_uri: z.string().nullable(),
      trust_label: z.string().min(1).max(32),
    }),
  ),
  abstained: z.boolean(),
  abstain_reason: z.string().nullable(),
});

export const textPreviewSchema = z.object({
  document_id: uuid,
  page_count: count,
  pages: z.array(
    z.object({
      page: z.number().int().min(1),
      text: z.string(),
      ocr: z.boolean(),
      readable: z.boolean(),
    }),
  ),
  next_page: z.number().int().min(1).nullable(),
});
