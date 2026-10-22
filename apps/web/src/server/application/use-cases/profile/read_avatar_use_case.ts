import { NotFoundError } from '@/server/domain/errors/domain_error';
import {
  AVATAR_MAX_BYTES,
  avatarVariantKey,
  parseAvatarBaseKey,
  type AvatarSize,
} from '@/server/domain/profile/avatar';
import type { ObjectStore } from '@/server/domain/repositories/object_store';
import type { UserProfileRepository } from '@/server/domain/repositories/user_profile_repository';

export class ReadAvatarUseCase {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly store: ObjectStore,
  ) {}

  /** Reads the session user's own avatar; another user's is a separate, membership-checked route. */
  async execute(input: { user_id: string; size: AvatarSize }): Promise<{ bytes: Uint8Array; content_type: 'image/webp' }> {
    const key = await this.profiles.findAvatarKey(input.user_id);
    if (!parseAvatarBaseKey(key)) {
      throw new NotFoundError('Avatar', input.user_id);
    }
    const bytes = await this.store.getObject(avatarVariantKey(key as string, input.size), AVATAR_MAX_BYTES);
    if (!bytes) {
      throw new NotFoundError('Avatar', input.user_id);
    }
    return { bytes, content_type: 'image/webp' };
  }
}
