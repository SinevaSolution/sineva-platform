import { z } from 'zod';
import { DEPARTMENTS, SALUTATIONS } from '@/server/domain/entities/user_profile';
import {
  ABOUT_ME_MAX,
  charCount,
  FULL_NAME_MAX,
  FULL_NAME_MIN,
  JOB_TITLE_MAX,
  NAME_CHARS,
  normalizePhoneNumber,
  PREFERRED_NAME_MAX,
} from '@/shared/profile_options';
import { LocaleSchema } from './locale_dto';

export { DEPARTMENTS, normalizePhoneNumber, SALUTATIONS };

// Returns the canonical zone name, or null when the runtime rejects it.
// `Intl.DateTimeFormat` is the validator (rather than a hardcoded list) so the
// check follows the ICU data of the running Node. Two gotchas: it accepts any
// casing ('asia/jakarta'), so we store `resolvedOptions().timeZone` to keep
// one spelling per zone; and recent V8 also accepts UTC offsets ('+07:00'),
// which are not IANA zones and would not survive a DST-aware conversion, so
// they are refused up front.
function canonicalTimeZone(value: string): string | null {
  if (/^[+-]/.test(value)) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const codePoints = charCount;

const FullNameSchema = z
  .string()
  .trim()
  .min(FULL_NAME_MIN, 'Name must be at least 2 characters')
  .max(FULL_NAME_MAX, 'Name is too long')
  .regex(NAME_CHARS, 'Name can only use letters, spaces, apostrophes, periods and hyphens')
  .regex(/\p{L}/u, 'Name needs at least one letter');

// Control characters are refused; everything else is allowed because a
// nickname is free text. React escapes on render.
const PreferredNameSchema = z
  .string()
  .trim()
  .min(1, 'Preferred name cannot be empty')
  .max(PREFERRED_NAME_MAX, 'Preferred name is too long')
  .refine((value) => !/\p{C}/u.test(value), 'Preferred name has invalid characters');

const AboutMeSchema = z
  .string()
  .trim()
  .refine((value) => codePoints(value) <= ABOUT_ME_MAX, 'About me is too long (280 characters at most)');

const PhoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizePhoneNumber(value);
  if (normalized === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number' });
    return z.NEVER;
  }
  return normalized;
});

const TimeZoneSchema = z.string().transform((value, ctx) => {
  const canonical = canonicalTimeZone(value);
  if (canonical === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown time zone' });
    return z.NEVER;
  }
  return canonical;
});

// `.strict()` so a body carrying `user_id`, `email`, `status` and the like
// fails with 422 instead of being silently dropped: identity and system
// fields come from the session and the server only. `null` clears an
// optional attribute; required ones (name, locale, timezone) have no null.
export const UpdateProfileSchema = z
  .object({
    full_name: FullNameSchema.optional(),
    preferred_name: PreferredNameSchema.nullable().optional(),
    salutation: z.enum(SALUTATIONS).nullable().optional(),
    phone_number: PhoneSchema.nullable().optional(),
    about_me: AboutMeSchema.nullable().optional(),
    use_profile_in_context: z.boolean().optional(),
    locale: LocaleSchema.optional(),
    timezone: TimeZoneSchema.optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

// Workspace-scoped attributes of the caller's own membership. Role,
// specialist access and ids are not here: they are admin operations.
export const MemberProfileUpdateSchema = z
  .object({
    job_title: z.string().trim().min(1).max(JOB_TITLE_MAX, 'Job title is too long').nullable().optional(),
    department: z.enum(DEPARTMENTS).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export type MemberProfileUpdateDto = z.infer<typeof MemberProfileUpdateSchema>;
