import 'server-only';
import sharp from 'sharp';
import { AVATAR_SIZES, unsupportedImage, type AvatarSize } from '@/server/domain/profile/avatar';
import type { AvatarImageProcessor } from '@/server/domain/repositories/avatar_image_processor';

// Pixel budget of the decoder, not a byte limit: a tiny PNG can declare
// 60000x60000 pixels and exhaust memory (decompression bomb). 24 MP covers any
// phone photo (a 48 MP sensor is rare in a 2 MB JPEG) while bounding the
// decoder to about 100 MB of raw pixels.
const MAX_INPUT_PIXELS = 24_000_000;

export class SharpAvatarImageProcessor implements AvatarImageProcessor {
  async toVariants(bytes: Uint8Array): Promise<Record<AvatarSize, Uint8Array>> {
    try {
      const out = {} as Record<AvatarSize, Uint8Array>;
      for (const size of AVATAR_SIZES) {
        // One decode per size keeps the code obvious; two small images per
        // upload does not justify cloning a pipeline.
        out[size] = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
          // Bakes in the EXIF orientation first; without it a phone photo
          // would be stored sideways once the metadata is gone.
          .rotate()
          // `cover` + centre is the square crop; `withoutEnlargement` stays
          // off so a small source is upscaled to the fixed size the UI expects.
          .resize(size, size, { fit: 'cover', position: 'centre' })
          // No `withMetadata()`: sharp drops EXIF, ICC and XMP by default,
          // which is the whole point of re-encoding instead of copying bytes.
          .webp({ quality: 82 })
          .toBuffer();
      }
      return out;
    } catch {
      // Any decoder failure (truncated file, bomb, a polyglot that passed the
      // magic-byte check) is "this is not a usable image", not a server fault.
      throw unsupportedImage('The image could not be read', 'invalid_image');
    }
  }
}
