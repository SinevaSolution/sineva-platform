import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZES,
  avatarBaseKey,
  avatarVariantKey,
  detectImageType,
  parseAvatarBaseKey,
  unsupportedImage,
} from '@/server/domain/profile/avatar';
import type { AvatarImageProcessor } from '@/server/domain/repositories/avatar_image_processor';
import type { ObjectStore } from '@/server/domain/repositories/object_store';
import type { UserProfileRepository } from '@/server/domain/repositories/user_profile_repository';

export interface AvatarDeps {
  profiles: UserProfileRepository;
  store: ObjectStore;
  processor: AvatarImageProcessor;
  audit: AuditLogger;
  /** Source of version uuids; injected so tests are deterministic. */
  newId: () => string;
}

export interface PublishedAvatar {
  base_key: string;
  /** Deletions that failed after the new avatar was already live. */
  cleanup_failed_count: number;
}

/** Deletes keys and counts failures: a leftover object must be visible, but must not undo a finished upload. */
export async function deleteKeys(store: ObjectStore, keys: string[]): Promise<number> {
  const results = await Promise.allSettled(keys.map((key) => store.deleteObject(key)));
  return results.filter((result) => result.status === 'rejected').length;
}

/**
 * The shared tail of every avatar source (browser upload, OAuth copy): size
 * and magic-byte gates, server-side re-encode, write both variants, switch the
 * stored key, remove the previous version. Ordering matters: variants are
 * written before the key switches, so a reader never sees a key without
 * objects, and the previous version is removed last, so a failure in between
 * leaves the old avatar intact.
 */
export async function publishAvatar(
  deps: AvatarDeps,
  userId: string,
  bytes: Uint8Array,
): Promise<PublishedAvatar> {
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) {
    throw unsupportedImage('The image must be 2 MB or smaller', 'image_too_large');
  }
  // Declared type and file name are ignored: only the bytes decide.
  if (detectImageType(bytes) === null) {
    throw unsupportedImage('Only JPEG, PNG and WebP images are accepted');
  }

  const variants = await deps.processor.toVariants(bytes);
  const base_key = avatarBaseKey(userId, deps.newId());
  for (const size of AVATAR_SIZES) {
    await deps.store.putObject(avatarVariantKey(base_key, size), variants[size], 'image/webp');
  }

  const previous = await deps.profiles.findAvatarKey(userId);
  await deps.profiles.setAvatarKey(userId, base_key);

  const stale = parseAvatarBaseKey(previous) && previous !== base_key
    ? AVATAR_SIZES.map((size) => avatarVariantKey(previous as string, size))
    : [];
  return { base_key, cleanup_failed_count: await deleteKeys(deps.store, stale) };
}
