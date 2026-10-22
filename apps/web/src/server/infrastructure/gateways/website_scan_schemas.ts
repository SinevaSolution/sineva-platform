import 'server-only';
import { z } from 'zod';
import { SCAN_FAILURE_CODES } from '@/server/domain/onboarding/profile_scan';

// The proposed `POST /internal/v1/profile/scan` answer (ADR-0031, fixtures
// `scan_*.json`). Only what the platform reads is declared; zod strips the
// rest, so sineva-ai may add fields. Declared strictly where it matters:
//
// - evidence is required on every extracted value (FR-ONB-09: "it never
//   invents fields"), so a value without it fails the contract instead of
//   reaching the review screen;
// - `source_url` becomes a "From your website" link, so only http(s) is accepted;
// - lengths are capped so a hostile page cannot make the platform store a book;
// - offers declare no price: zod drops one if it appears, because a price exists
//   only when the owner types it (FR-ONB-16).

const HttpUrl = z
  .string()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), 'Only http and https links');

const evidence = {
  source_url: HttpUrl,
  evidence_snippet: z.string().min(1).max(500),
};

const textField = z.object({ value: z.string().min(1).max(1000), ...evidence });

const contactChannel = z.object({
  kind: z.enum(['whatsapp', 'phone', 'email', 'instagram', 'other']),
  value: z.string().min(1).max(200),
});

export const scanResultSchema = z.object({
  scan_id: z.string().min(1).max(64),
  status: z.enum(['succeeded', 'partial', 'failed']),
  source_url: HttpUrl,
  final_url: HttpUrl.nullable().optional().transform((value) => value ?? null),
  fetched_pages: z.number().int().min(0).max(50),
  site_language: z.string().max(16).nullable().optional().transform((value) => value ?? null),
  fields: z
    .object({
      display_name: textField.optional(),
      description: textField.optional(),
      tone_cues: z.object({ value: z.array(z.string().min(1).max(40)).max(10), ...evidence }).optional(),
      contact_channels: z.object({ value: z.array(contactChannel).max(10), ...evidence }).optional(),
    })
    .default({}),
  offers: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(500).nullable().optional().transform((value) => value ?? null),
        ...evidence,
      }),
    )
    .max(50)
    .default([]),
  policies: z
    .array(
      z.object({
        kind: z.string().min(1).max(32),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(2000),
        ...evidence,
      }),
    )
    .max(20)
    .default([]),
  error_code: z
    .enum(SCAN_FAILURE_CODES)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const scanResultEnvelopeSchema = z.object({
  success: z.literal(true),
  data: scanResultSchema,
});
