import type { AvatarSize } from '@/server/domain/profile/avatar';
import type { AvatarImageProcessor } from '@/server/domain/repositories/avatar_image_processor';

export class FakeAvatarImageProcessor implements AvatarImageProcessor {
  readonly inputs: Uint8Array[] = [];

  async toVariants(bytes: Uint8Array): Promise<Record<AvatarSize, Uint8Array>> {
    this.inputs.push(bytes);
    return { 256: new Uint8Array([1, 2, 56]), 64: new Uint8Array([1, 2, 64]) };
  }
}
