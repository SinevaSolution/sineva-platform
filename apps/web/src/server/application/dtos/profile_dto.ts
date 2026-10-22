import { z } from 'zod';
import { DEPARTMENTS, SALUTATIONS } from '@/server/domain/entities/user_profile';
import { LocaleSchema } from './locale_dto';

export { DEPARTMENTS, SALUTATIONS };

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

/**
 * Normalises a phone number to E.164, or returns null when it is not one.
 * Separators (space, dash, dot, parentheses) are dropped. `0` is the Indonesian
 * trunk prefix (`0812...` is `+62812...`), `00` is the international call
 * prefix, a bare `62...` is read as Indonesian. Any other number must already
 * carry its `+country` code: guessing a country for `4155552671` would store a
 * wrong number silently. E.164 allows 8 to 15 digits after `+`, first digit
 * non-zero. Verification is a separate flow; this only checks the shape.
 */
export function normalizePhoneNumber(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, '');
  let digits: string;
  if (compact.startsWith('+')) {
    digits = compact.slice(1);
  } else if (compact.startsWith('00')) {
    digits = compact.slice(2);
  } else if (compact.startsWith('0')) {
    digits = `62${compact.slice(1)}`;
  } else if (compact.startsWith('62')) {
    digits = compact;
  } else {
    return null;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

// Letters of any script, combining marks, space, apostrophe (straight and
// typographic), period and hyphen. Digits and markup are refused so a name
// never carries a number or tags into emails, audit rows or prompts.
const NAME_CHARS = /^[\p{L}\p{M}'’. -]+$/u;

const codePoints = (value: string): number => [...value].length;

const FullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name is too long')
  .regex(NAME_CHARS, 'Name can only use letters, spaces, apostrophes, periods and hyphens')
  .regex(/\p{L}/u, 'Name needs at least one letter');

// Control characters are refused; everything else is allowed because a
// nickname is free text. React escapes on render.
const PreferredNameSchema = z
  .string()
  .trim()
  .min(1, 'Preferred name cannot be empty')
  .max(40, 'Preferred name is too long')
  .refine((value) => !/\p{C}/u.test(value), 'Preferred name has invalid characters');

const AboutMeSchema = z
  .string()
  .trim()
  .refine((value) => codePoints(value) <= 280, 'About me is too long (280 characters at most)');

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
    job_title: z.string().trim().min(1).max(60, 'Job title is too long').nullable().optional(),
    department: z.enum(DEPARTMENTS).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export type MemberProfileUpdateDto = z.infer<typeof MemberProfileUpdateSchema>;
