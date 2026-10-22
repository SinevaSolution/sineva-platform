import { AVATAR_MAX_BYTES, AVATAR_PRESIGN_SECONDS, pendingAvatarKey, unsupportedImage } from '@/server/domain/profile/avatar';
import { AVATAR_CONTENT_TYPES } from '@/server/domain/profile/avatar';
import type { ObjectStore } from '@/server/domain/repositories/object_store';

export interface RequestAvatarUploadInput {
  user_id: string;
  content_type: string;
  file_size_bytes: number;
}

export interface AvatarUploadTicket {
  upload_id: string;
  upload_url: string;
  method: 'PUT';
  /** Headers the browser must send with the PUT, exactly as listed. */
  headers: Record<string, string>;
  expires_in_seconds: number;
  max_bytes: number;
}

export class RequestAvatarUploadUseCase {
  constructor(
    private readonly store: ObjectStore,
    private readonly newId: () => string,
  ) {}

  async execute(input: RequestAvatarUploadInput): Promise<AvatarUploadTicket> {
    // The route DTO already checks these; the use case repeats them because it
    // is the unit that must never presign something out of bounds.
    if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(input.content_type)) {
      throw unsupportedImage('Only JPEG, PNG and WebP images are accepted');
    }
    if (!Number.isInteger(input.file_size_bytes) || input.file_size_bytes < 1 || input.file_size_bytes > AVATAR_MAX_BYTES) {
      throw unsupportedImage('The image must be 2 MB or smaller', 'image_too_large');
    }

    const upload_id = this.newId();
    const presigned = await this.store.createPresignedPut({
      key: pendingAvatarKey(input.user_id, upload_id),
      content_type: input.content_type,
      size_bytes: input.file_size_bytes,
      expires_in_seconds: AVATAR_PRESIGN_SECONDS,
    });

    return {
      upload_id,
      upload_url: presigned.upload_url,
      method: 'PUT',
      headers: { 'Content-Type': input.content_type },
      expires_in_seconds: presigned.expires_in_seconds,
      max_bytes: AVATAR_MAX_BYTES,
    };
  }
}
