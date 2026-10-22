import type { RequestContext } from '@/server/domain/context/request_context';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';
import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { AVATAR_MAX_BYTES, pendingAvatarKey } from '@/server/domain/profile/avatar';
import { deleteKeys, publishAvatar, type AvatarDeps } from './avatar_pipeline';

export interface CompleteAvatarUploadInput {
  user_id: string;
  upload_id: string;
  context?: RequestContext;
}

export class CompleteAvatarUploadUseCase {
  constructor(private readonly deps: AvatarDeps) {}

  async execute(input: CompleteAvatarUploadInput): Promise<UserProfileEntity> {
    const { user_id, upload_id, context } = input;
    const { store, profiles, audit } = this.deps;
    // The session user is part of the key, so another user's pending upload
    // is simply "not found" here.
    const pending = pendingAvatarKey(user_id, upload_id);

    const bytes = await store.getObject(pending, AVATAR_MAX_BYTES);
    if (!bytes) {
      throw new NotFoundError('Avatar upload', upload_id);
    }

    let cleanup_failed_count: number;
    try {
      ({ cleanup_failed_count } = await publishAvatar(this.deps, user_id, bytes));
    } catch (error) {
      if (error instanceof ValidationError) {
        // A rejected file is removed so it cannot be retried into acceptance.
        // The caller needs the validation error, so a failed delete of the
        // pending object is not allowed to replace it.
        await deleteKeys(store, [pending]);
      }
      throw error;
    }

    const pendingCleanupFailures = await deleteKeys(store, [pending]);
    await audit.log({
      action: 'user.avatar_updated',
      context: context ?? { ...createAnonymousRequestContext('avatar-complete'), user_id },
      target_resource_type: 'user',
      target_resource_id: user_id,
      metadata: {
        action: 'uploaded',
        cleanup_failed_count: cleanup_failed_count + pendingCleanupFailures,
      },
    });

    const profile = await profiles.findById(user_id);
    if (!profile) {
      throw new NotFoundError('User', user_id);
    }
    return profile;
  }
}
