import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CompleteAvatarUploadUseCase } from '@/server/application/use-cases/profile/complete_avatar_upload_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { avatarBaseKey, avatarVariantKey, pendingAvatarKey } from '@/server/domain/profile/avatar';
import { AllowlistedRemoteImageFetcher } from '@/server/infrastructure/media/allowlisted_remote_image_fetcher';
import { SharpAvatarImageProcessor } from '@/server/infrastructure/media/sharp_avatar_image_processor';
import { FakeObjectStore } from './fakes/fake_object_store';
import { buildUserProfile, FakeUserProfileRepository } from './fakes/fake_user_profile_repository';

const USER = '11111111-1111-4111-8111-111111111111';
const UPLOAD = '44444444-4444-4444-8444-444444444444';
const VERSION = '55555555-5555-4555-8555-555555555555';

const processor = new SharpAvatarImageProcessor();

async function wide(format: 'png' | 'jpeg' | 'webp') {
  return sharp({ create: { width: 600, height: 300, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    [format]()
    .toBuffer();
}

// Inserts a tEXt chunk before IEND: a place a script payload can hide in an otherwise valid PNG.
function pngWithTextChunk(png: Buffer, keyword: string, text: string): Buffer {
  const iend = png.length - 12;
  const data = Buffer.from(`${keyword}\0${text}`, 'latin1');
  const type = Buffer.from('tEXt', 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([png.subarray(0, iend), length, type, data, crc, png.subarray(iend)]);
}

describe('SharpAvatarImageProcessor (FR-AUTH-07b avatar pipeline)', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('turns a %s into square WebP at 256 and 64 px', async (format) => {
    const variants = await processor.toVariants(await wide(format));

    for (const [size, bytes] of [
      [256, variants[256]],
      [64, variants[64]],
    ] as const) {
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(size);
      expect(meta.height).toBe(size);
    }
  });

  it('crops to the centre rather than squashing', async () => {
    // Left half blue, right half red: a centre crop of a 2:1 image keeps both halves in equal parts.
    const left = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
    const right = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const source = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#000' } })
      .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 300, top: 0 }])
      .png()
      .toBuffer();

    const { data, info } = await sharp((await processor.toVariants(source))[64]).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number) => [data[(32 * info.width + x) * info.channels], data[(32 * info.width + x) * info.channels + 2]];
    expect(pixel(4)[1]).toBeGreaterThan(200); // blue on the left
    expect(pixel(59)[0]).toBeGreaterThan(200); // red on the right
  });

  it('strips EXIF (a JPEG carrying a copyright and GPS-like tag comes out clean)', async () => {
    const jpeg = await sharp(await wide('jpeg'))
      .withExif({ IFD0: { Copyright: 'secret-owner', Artist: 'secret-artist' } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const out = (await processor.toVariants(jpeg))[256];

    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(Buffer.from(out).includes('secret-owner')).toBe(false);
    expect(Buffer.from(out).includes('secret-artist')).toBe(false);
  });

  it('applies the EXIF orientation before dropping it', async () => {
    // 600x300 stored with orientation 6 displays as 300x600 (portrait); the crop must come from the displayed image.
    const jpeg = await sharp(await wide('jpeg')).withMetadata({ orientation: 6 }).toBuffer();
    const meta = await sharp((await processor.toVariants(jpeg))[256]).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.orientation).toBeUndefined();
  });

  it('does not carry a script payload hidden in a PNG text chunk into the output', async () => {
    const hostile = pngWithTextChunk(await wide('png'), 'Comment', '<script>alert(document.cookie)</script>');
    expect(Buffer.from(hostile).includes('<script>')).toBe(true);

    const variants = await processor.toVariants(hostile);

    expect(Buffer.from(variants[256]).includes('<script>')).toBe(false);
    expect(Buffer.from(variants[64]).includes('alert(')).toBe(false);
  });

  it('refuses bytes that pass a magic-byte check but are not decodable', async () => {
    const truncated = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage')]);
    await expect(processor.toVariants(truncated)).rejects.toThrow(ValidationError);
  });

  it('refuses an image with an absurd pixel count (decompression bomb)', async () => {
    const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(processor.toVariants(bomb)).rejects.toThrow(ValidationError);
  });
});

describe('avatar completion end to end with the real image processor', () => {
  function build() {
    const profiles = new FakeUserProfileRepository();
    profiles.seed(buildUserProfile({ id: USER }));
    const store = new FakeObjectStore();
    const useCase = new CompleteAvatarUploadUseCase({
      profiles,
      store,
      processor,
      audit: new CountingAuditLogger(),
      newId: () => VERSION,
    });
    return { profiles, store, useCase };
  }

  it('stores two WebP objects and no original', async () => {
    const { store, useCase } = build();
    store.upload(pendingAvatarKey(USER, UPLOAD), await wide('jpeg'));

    await useCase.execute({ user_id: USER, upload_id: UPLOAD });

    const base = avatarBaseKey(USER, VERSION);
    expect([...store.objects.keys()].sort()).toEqual([avatarVariantKey(base, 256), avatarVariantKey(base, 64)].sort());
  });

  it('rejects an SVG that was uploaded with an image/png content type', async () => {
    const { store, useCase } = build();
    store.upload(
      pendingAvatarKey(USER, UPLOAD),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
      'image/png',
    );

    await expect(useCase.execute({ user_id: USER, upload_id: UPLOAD })).rejects.toThrow(ValidationError);
    expect(store.objects.size).toBe(0);
  });

  it('rejects a PNG with a script payload only when it cannot be decoded, and never stores the payload when it can', async () => {
    const { store, useCase } = build();
    store.upload(pendingAvatarKey(USER, UPLOAD), pngWithTextChunk(await wide('png'), 'Comment', '<script>x</script>'));

    await useCase.execute({ user_id: USER, upload_id: UPLOAD });

    for (const { bytes } of store.objects.values()) {
      expect(Buffer.from(bytes).includes('<script>')).toBe(false);
    }
  });
});

describe('AllowlistedRemoteImageFetcher', () => {
  const fetcher = new AllowlistedRemoteImageFetcher();

  it.each([
    'http://lh3.googleusercontent.com/a/x',
    'https://evil.example.com/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/a.png',
    'https://lh3.googleusercontent.com.evil.example/a.png',
    'https://user:pw@lh3.googleusercontent.com/a.png',
    'https://lh3.googleusercontent.com:8443/a.png',
    'file:///etc/passwd',
    'not a url',
  ])('refuses %s without making a request', async (url) => {
    await expect(fetcher.fetch(url, 2_000_000)).resolves.toBeNull();
  });
});
