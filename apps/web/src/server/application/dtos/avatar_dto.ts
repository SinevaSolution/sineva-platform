import { z } from 'zod';
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES } from '@/server/domain/profile/avatar';

// The declared type is a first gate and a hint for the presign; the server
// decides the real type from the bytes when the upload completes.
export const RequestAvatarUploadSchema = z
  .object({
    content_type: z.enum(AVATAR_CONTENT_TYPES),
    file_size_bytes: z.number().int().min(1).max(AVATAR_MAX_BYTES),
  })
  .strict();
export type RequestAvatarUploadDto = z.infer<typeof RequestAvatarUploadSchema>;

export const CompleteAvatarUploadSchema = z
  .object({
    upload_id: z.string().uuid(),
  })
  .strict();
export type CompleteAvatarUploadDto = z.infer<typeof CompleteAvatarUploadSchema>;

// Query string values are strings: '256' or '64', 256 when absent.
export const AvatarSizeQuerySchema = z.object({
  size: z.enum(['256', '64']).default('256').transform((value) => Number(value) as 256 | 64),
});
