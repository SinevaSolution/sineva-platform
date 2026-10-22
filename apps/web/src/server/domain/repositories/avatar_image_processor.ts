import type { AvatarSize } from '../profile/avatar';

/**
 * Turns an uploaded image into the stored avatar variants: square crop, WebP,
 * every size in `AVATAR_SIZES`, no metadata. Implementations throw a
 * `ValidationError` for an undecodable or oversized-in-pixels image.
 */
export interface AvatarImageProcessor {
  toVariants(bytes: Uint8Array): Promise<Record<AvatarSize, Uint8Array>>;
}
