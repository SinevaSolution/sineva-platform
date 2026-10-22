import { z } from 'zod';

// `owner` is not an accepted role anywhere on the wire: ownership moves only
// through the transfer flow (ADR-0029), so a request that names it is a
// validation error before any use case runs.
const AssignableRoleSchema = z.enum(['admin', 'member', 'viewer']);

const ScopeSchema = z.enum(['all', 'selected']);

const SlugListSchema = z.array(z.string().trim().min(1).max(64)).max(50);

export const IdParamSchema = z.string().uuid();

// 32 random bytes as base64url are 43 characters; the bounds tolerate a
// longer token format later without letting an arbitrary string reach the
// repository.
export const LinkTokenParamSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid token');

export const InviteMemberSchema = z
  .object({
    email: z.string().trim().max(254).email('Invalid email address'),
    role: AssignableRoleSchema,
    specialist_scope: ScopeSchema.optional(),
    specialist_slugs: SlugListSchema.optional(),
  })
  .strict();

export type InviteMemberDto = z.infer<typeof InviteMemberSchema>;

export const UpdateMemberSchema = z
  .object({
    role: AssignableRoleSchema.optional(),
    specialist_scope: ScopeSchema.optional(),
    specialist_slugs: SlugListSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Send at least one of role, specialist_scope or specialist_slugs',
  })
  .refine((value) => value.specialist_slugs === undefined || value.specialist_scope === 'selected', {
    message: 'specialist_slugs goes with specialist_scope "selected"',
    path: ['specialist_slugs'],
  });

export type UpdateMemberDto = z.infer<typeof UpdateMemberSchema>;

export const SetMemberSpecialistsSchema = z
  .object({
    specialist_slugs: SlugListSchema.min(1, 'Pick at least one specialist'),
  })
  .strict();

export type SetMemberSpecialistsDto = z.infer<typeof SetMemberSpecialistsSchema>;

export const RequestOwnershipTransferSchema = z
  .object({
    target_member_id: z.string().uuid(),
  })
  .strict();

export type RequestOwnershipTransferDto = z.infer<typeof RequestOwnershipTransferSchema>;
