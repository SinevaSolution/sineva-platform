import { z } from 'zod';
import { GOAL_KEYS } from '@/server/domain/business_profile/business_profile';
import { BUSINESS_TYPES } from '@/server/domain/onboarding/first_task_catalog';
import { MEMBER_STEP_COUNT, OWNER_STEP_COUNT, TEAM_SIZES, type OnboardingFlow } from '@/server/domain/onboarding/onboarding';
import { DEPARTMENTS, SALUTATIONS } from '@/server/domain/entities/user_profile';
import { JOB_TITLE_MAX, PREFERRED_NAME_MAX, normalizePhoneNumber } from '@/shared/profile_options';
import {
  OfferingCreateSchema,
  PolicyCreateSchema,
  ProfileValuesSchema,
  PROFILE_LIMITS,
} from './business_profile_dto';

const noControlChars = (value: string) => !/\p{C}/u.test(value);
const text = (max: number) =>
  z.string().trim().min(1).max(max).refine(noControlChars, 'Contains characters that are not allowed');

const HttpLink = z
  .string()
  .trim()
  .max(PROFILE_LIMITS.url)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'Only http and https links are accepted');

// Instagram input is a handle, not a page to read (FR-ONB-13).
const InstagramHandle = z
  .string()
  .trim()
  .regex(/^@?[A-Za-z0-9._]{1,30}$/, 'Enter a handle such as @yourshop');

const Phone = z.string().transform((value, ctx) => {
  const normalized = normalizePhoneNumber(value);
  if (normalized === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number' });
    return z.NEVER;
  }
  return normalized;
});

const AboutYou = z
  .object({
    preferred_name: text(PREFERRED_NAME_MAX).nullable().optional(),
    salutation: z.enum(SALUTATIONS).nullable().optional(),
    job_title: text(JOB_TITLE_MAX).nullable().optional(),
    department: z.enum(DEPARTMENTS).nullable().optional(),
    phone_number: Phone.nullable().optional(),
  })
  .strict();

const LanguageStep = z.object({ language: z.enum(['id', 'en']), about_you: AboutYou.optional() }).strict();
const BusinessStep = z
  .object({
    business_name: text(PROFILE_LIMITS.name),
    business_type: z.enum(BUSINESS_TYPES),
    team_size: z.enum(TEAM_SIZES).optional(),
    city: text(PROFILE_LIMITS.short).nullable().optional(),
    province: text(PROFILE_LIMITS.short).nullable().optional(),
  })
  .strict();
const ChannelsStep = z
  .object({
    website_url: HttpLink.nullable().optional(),
    instagram_handle: InstagramHandle.nullable().optional(),
    marketplace_url: HttpLink.nullable().optional(),
  })
  .strict();
const GoalsStep = z.object({ goals: z.array(z.enum(GOAL_KEYS)).max(3) }).strict();
const NoAnswers = z.object({}).strict();

const OWNER_STEP_SCHEMAS = [LanguageStep, BusinessStep, ChannelsStep, GoalsStep, NoAnswers] as const;
const MEMBER_STEP_SCHEMAS = [LanguageStep, NoAnswers] as const;

export const PatchOnboardingSchema = z
  .object({
    step: z.number().int().min(1).max(OWNER_STEP_COUNT),
    action: z.enum(['save', 'skip']),
    answers: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type PatchOnboardingDto = z.infer<typeof PatchOnboardingSchema>;

/** Validates a step's answers against that step's own schema, strictly: an unknown key is a 422. */
export function parseStepAnswers(flow: OnboardingFlow, step: number, answers: unknown): Record<string, unknown> {
  const schemas = flow === 'owner' ? OWNER_STEP_SCHEMAS : MEMBER_STEP_SCHEMAS;
  const schema = schemas[step - 1];
  return schema.parse(answers ?? {}) as Record<string, unknown>;
}

/**
 * The answer keys each owner step owns. Saving a step replaces exactly these
 * keys, so a field the person cleared on that step is really gone instead of
 * lingering from an earlier save.
 */
export const OWNER_STEP_KEYS: ReadonlyArray<readonly string[]> = [
  ['language', 'about_you'],
  ['business_name', 'business_type', 'team_size', 'city', 'province'],
  ['website_url', 'instagram_handle', 'marketplace_url'],
  ['goals'],
  [],
];
export const MEMBER_STEP_KEYS: ReadonlyArray<readonly string[]> = [['language', 'about_you'], []];

export function stepCount(flow: OnboardingFlow): number {
  return flow === 'owner' ? OWNER_STEP_COUNT : MEMBER_STEP_COUNT;
}

export const CompleteOnboardingSchema = z
  .object({
    profile: ProfileValuesSchema.optional(),
    field_sources: z.record(z.string(), z.enum(['user', 'website'])).optional(),
    scan_id: z.string().uuid().optional(),
    offerings: z.array(OfferingCreateSchema).max(50).optional(),
    policies: z.array(PolicyCreateSchema).max(30).optional(),
  })
  .strict();
export type CompleteOnboardingDto = z.infer<typeof CompleteOnboardingSchema>;

export const ScanRequestSchema = z
  .object({
    source_url: z.string().trim().min(1).max(PROFILE_LIMITS.url),
    locale: z.enum(['id', 'en']).optional(),
  })
  .strict();
export type ScanRequestDto = z.infer<typeof ScanRequestSchema>;

export const FirstTasksQuerySchema = z.object({ locale: z.enum(['id', 'en']).optional() }).strict();
