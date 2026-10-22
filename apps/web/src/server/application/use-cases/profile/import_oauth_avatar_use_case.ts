import { createAnonymousRequestContext } from '@/server/domain/context/request_context';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { AVATAR_MAX_BYTES } from '@/server/domain/profile/avatar';
import type { RemoteImageFetcher } from '@/server/domain/repositories/remote_image_fetcher';
import { publishAvatar, type AvatarDeps } from './avatar_pipeline';

export interface ImportOAuthAvatarInput {
  user_id: string;
  remote_url: string;
  provider: string;
}

export class ImportOAuthAvatarUseCase {
  constructor(private readonly deps: AvatarDeps & { fetcher: RemoteImageFetcher }) {}

  /**
   * Copies a provider picture into our storage once, at first sign-up. The
   * remote URL is never stored, so the picture is never hotlinked (it would
   * leak the viewer's IP to the provider and break when the provider rotates
   * it). A person who already has an avatar keeps it. Returns whether a copy
   * was made; every failure is a skip, because a picture must not fail a
   * sign-up.
   */
  async execute(input: ImportOAuthAvatarInput): Promise<boolean> {
    const { profiles, audit, fetcher } = this.deps;
    if (await profiles.findAvatarKey(input.user_id)) {
      return false;
    }

    const bytes = await fetcher.fetch(input.remote_url, AVATAR_MAX_BYTES);
    if (!bytes) {
      return false;
    }

    let cleanup_failed_count: number;
    try {
      ({ cleanup_failed_count } = await publishAvatar(this.deps, input.user_id, bytes));
    } catch (error) {
      if (error instanceof ValidationError) {
        return false;
      }
      throw error;
    }

    await audit.log({
      action: 'user.avatar_updated',
      context: { ...createAnonymousRequestContext('oauth-avatar-import'), user_id: input.user_id },
      target_resource_type: 'user',
      target_resource_id: input.user_id,
      metadata: { action: 'imported', provider: input.provider, cleanup_failed_count },
    });
    return true;
  }
}
