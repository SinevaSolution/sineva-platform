import { z } from 'zod';
import {
  EMOJI_USE_VALUES,
  FORMALITY_VALUES,
  GOAL_KEYS,
  POLICY_KINDS,
  PROFILE_FIELD_KEYS,
} from '@/server/domain/business_profile/business_profile';

// Length caps (FR-ONB-19: profile text is length-capped). Plain text only:
// control characters are refused, markup is data and rendered escaped.
export const PROFILE_LIMITS = {
  name: 100,
  legal_name: 150,
  short: 80,
  audience: 500,
  url: 2048,
  handle: 200,
  hours_note: 300,
  voice_word: 40,
  voice_words: 20,
  voice_sample: 500,
  voice_samples: 3,
  offering_name: 120,
  offering_description: 500,
  policy_title: 120,
  policy_body: 2000,
} as const;

function plainText(max: number, options: { multiline?: boolean } = {}) {
  const forbidden = options.multiline ? /[^\P{C}\n\t]/u : /\p{C}/u;
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => !forbidden.test(value), 'Contains characters that are not allowed')
    .transform((value) => (value === '' ? null : value));
}

// Required variants refuse the empty string instead of turning it into null.
function requiredText(max: number, options: { multiline?: boolean } = {}) {
  const forbidden = options.multiline ? /[^\P{C}\n\t]/u : /\p{C}/u;
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !forbidden.test(value), 'Contains characters that are not allowed');
}

const HttpUrl = z
  .string()
  .trim()
  .max(PROFILE_LIMITS.url)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'Only http and https links are accepted')
  .transform((value) => value);

const OptionalUrl = z.union([HttpUrl, z.literal('').transform(() => null)]);

const WordList = z
  .array(requiredText(PROFILE_LIMITS.voice_word))
  .max(PROFILE_LIMITS.voice_words);

export const BrandVoiceSchema = z
  .object({
    formality: z.enum(FORMALITY_VALUES).optional(),
    second_person: z.enum(['anda', 'kamu', 'avoid']).optional(),
    emoji_use: z.enum(EMOJI_USE_VALUES).optional(),
    words_to_use: WordList.optional(),
    words_to_avoid: WordList.optional(),
    samples: z.array(requiredText(PROFILE_LIMITS.voice_sample, { multiline: true })).max(PROFILE_LIMITS.voice_samples).optional(),
  })
  .strict();

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const BusinessHoursSchema = z
  .object({
    note: requiredText(PROFILE_LIMITS.hours_note, { multiline: true }).optional(),
    days: z
      .array(
        z
          .object({
            day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
            opens: z.string().regex(HHMM),
            closes: z.string().regex(HHMM),
          })
          .strict(),
      )
      .max(14)
      .optional(),
  })
  .strict();

// Handles and links only: Instagram and marketplace pages are never read (FR-ONB-13).
export const SocialHandlesSchema = z
  .object({
    instagram: requiredText(PROFILE_LIMITS.handle).optional(),
    tiktok: requiredText(PROFILE_LIMITS.handle).optional(),
    facebook: requiredText(PROFILE_LIMITS.handle).optional(),
    x: requiredText(PROFILE_LIMITS.handle).optional(),
    marketplace_url: HttpUrl.optional(),
  })
  .strict();

const ProfileValueShape = {
  display_name: requiredText(PROFILE_LIMITS.name).nullable().optional(),
  legal_name: requiredText(PROFILE_LIMITS.legal_name).nullable().optional(),
  industry: requiredText(PROFILE_LIMITS.short).nullable().optional(),
  city: requiredText(PROFILE_LIMITS.short).nullable().optional(),
  province: requiredText(PROFILE_LIMITS.short).nullable().optional(),
  languages: z.array(z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/)).max(5).nullable().optional(),
  website_url: HttpUrl.nullable().optional(),
  social_handles: SocialHandlesSchema.nullable().optional(),
  business_hours: BusinessHoursSchema.nullable().optional(),
  brand_voice: BrandVoiceSchema.nullable().optional(),
  audience: requiredText(PROFILE_LIMITS.audience, { multiline: true }).nullable().optional(),
  goals: z.array(z.enum(GOAL_KEYS)).max(3).nullable().optional(),
};

const FieldSourcesSchema = z.record(z.enum(PROFILE_FIELD_KEYS), z.enum(['user', 'website'])).optional();

/**
 * `PUT /profile`. Keys left out stay as they are; `null` clears a field. Every
 * value the owner sends counts as confirmed when saved, so there is no
 * "draft" state in the profile: unconfirmed suggestions stay in the scan.
 * `field_sources` marks provenance for the review labels; a `website` source
 * needs the `scan_id` it came from.
 */
export const SaveProfileSchema = z
  .object({
    ...ProfileValueShape,
    field_sources: FieldSourcesSchema,
    scan_id: z.string().uuid().optional(),
    /** Optimistic concurrency: the version the editor started from. */
    base_version: z.number().int().min(0).optional(),
  })
  .strict();
export type SaveProfileDto = z.infer<typeof SaveProfileSchema>;

export const ProfileValuesSchema = z.object(ProfileValueShape).strict();

export const OfferingCreateSchema = z
  .object({
    name: requiredText(PROFILE_LIMITS.offering_name),
    description: plainText(PROFILE_LIMITS.offering_description, { multiline: true }).nullable().optional(),
    // Integer IDR typed by the owner. Nothing in the platform infers a price.
    price_amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    url: OptionalUrl.nullable().optional(),
    source: z.enum(['user', 'scan']).optional(),
    /** Draft rows (false) never enter the profile pack. Defaults to confirmed: the owner typed it. */
    confirmed: z.boolean().optional(),
  })
  .strict();
export type OfferingCreateDto = z.infer<typeof OfferingCreateSchema>;

export const OfferingUpdateSchema = z
  .object({
    name: requiredText(PROFILE_LIMITS.offering_name).optional(),
    description: plainText(PROFILE_LIMITS.offering_description, { multiline: true }).nullable().optional(),
    price_amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    url: OptionalUrl.nullable().optional(),
    position: z.number().int().min(0).max(49).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });
export type OfferingUpdateDto = z.infer<typeof OfferingUpdateSchema>;

export const PolicyCreateSchema = z
  .object({
    kind: z.enum(POLICY_KINDS),
    title: requiredText(PROFILE_LIMITS.policy_title),
    body: requiredText(PROFILE_LIMITS.policy_body, { multiline: true }),
    source: z.enum(['user', 'scan']).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict();
export type PolicyCreateDto = z.infer<typeof PolicyCreateSchema>;

export const PolicyUpdateSchema = z
  .object({
    kind: z.enum(POLICY_KINDS).optional(),
    title: requiredText(PROFILE_LIMITS.policy_title).optional(),
    body: requiredText(PROFILE_LIMITS.policy_body, { multiline: true }).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });
export type PolicyUpdateDto = z.infer<typeof PolicyUpdateSchema>;

export const VersionParamSchema = z.coerce.number().int().min(1);
export const VersionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    before: z.coerce.number().int().min(1).optional(),
  })
  .strict();
