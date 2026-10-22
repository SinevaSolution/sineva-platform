import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  createAnonymousRequestContext,
  type RequestContext,
} from '@/server/domain/context/request_context';
import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { AVATAR_SIZES, avatarVariantKey, parseAvatarBaseKey } from '@/server/domain/profile/avatar';
import type { ObjectStore } from '@/server/domain/repositories/object_store';
import type { UserProfileRepository } from '@/server/domain/repositories/user_profile_repository';
import { deleteKeys } from './avatar_pipeline';

export class RemoveAvatarUseCase {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly store: ObjectStore,
    private readonly audit: AuditLogger,
  ) {}

  async execute(input: { user_id: string; context?: RequestContext }): Promise<UserProfileEntity> {
    const { user_id, context } = input;
    const key = await this.profiles.findAvatarKey(user_id);

    // Key first, objects second: if a delete fails the person's avatar is
    // already gone from the product and the failure is counted in the audit row.
    await this.profiles.setAvatarKey(user_id, null);
    const cleanup_failed_count = parseAvatarBaseKey(key)
      ? await deleteKeys(this.store, AVATAR_SIZES.map((size) => avatarVariantKey(key as string, size)))
      : 0;

    if (key) {
      await this.audit.log({
        action: 'user.avatar_updated',
        context: context ?? { ...createAnonymousRequestContext('avatar-remove'), user_id },
        target_resource_type: 'user',
        target_resource_id: user_id,
        metadata: { action: 'removed', cleanup_failed_count },
      });
    }

    const profile = await this.profiles.findById(user_id);
    if (!profile) {
      throw new NotFoundError('User', user_id);
    }
    return profile;
  }
}
