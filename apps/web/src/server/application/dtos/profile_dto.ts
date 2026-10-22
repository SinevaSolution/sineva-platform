import { z } from 'zod';
import { LocaleSchema } from './locale_dto';

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

// `.strict()` so a body carrying `user_id`, `email` and the like fails with
// 422 instead of being silently dropped: identity comes from the session only.
export const UpdateProfileSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name is too long').optional(),
    locale: LocaleSchema.optional(),
    timezone: z
      .string()
      .transform((value, ctx) => {
        const canonical = canonicalTimeZone(value);
        if (canonical === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown time zone' });
          return z.NEVER;
        }
        return canonical;
      })
      .optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
