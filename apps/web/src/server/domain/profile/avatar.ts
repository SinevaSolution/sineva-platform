import { ValidationError } from '@/server/domain/errors/domain_error';

// Avatar rules in one place: limits, object keys and the magic-byte check.
// Keys are built only from validated UUIDs so no user-supplied string can
// shape a storage path (path traversal, key collision).

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
export const AVATAR_SIZES = [256, 64] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];
export const AVATAR_PRESIGN_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) {
    throw new ValidationError(`Invalid ${field}`, [
      { code: `invalid_${field}`, field, detail: `${field} must be a UUID` },
    ]);
  }
}

export function pendingAvatarKey(userId: string, uploadId: string): string {
  assertUuid(userId, 'user_id');
  assertUuid(uploadId, 'upload_id');
  return `avatars/pending/${userId}/${uploadId}`;
}

/** Stored in `users.avatar_url`: the prefix of the two size variants. */
export function avatarBaseKey(userId: string, version: string): string {
  assertUuid(userId, 'user_id');
  assertUuid(version, 'version');
  return `avatars/${userId}/${version}`;
}

export function avatarVariantKey(baseKey: string, size: AvatarSize): string {
  return `${baseKey}/${size}.webp`;
}

/** Splits a stored key; null for anything that is not one of ours (an old remote URL, junk). */
export function parseAvatarBaseKey(stored: string | null | undefined): { user_id: string; version: string } | null {
  const match = /^avatars\/([^/]+)\/([^/]+)$/.exec(stored ?? '');
  if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) {
    return null;
  }
  return { user_id: match[1], version: match[2] };
}

/**
 * The URL the browser uses. It is the authenticated own-avatar route; `v`
 * changes with every upload so a cached image is never shown after a change.
 */
export function avatarUrlForKey(stored: string | null | undefined): string | null {
  const parsed = parseAvatarBaseKey(stored);
  return parsed ? `/api/v1/me/avatar?v=${parsed.version}` : null;
}

export type DetectedImageType = 'jpeg' | 'png' | 'webp';

const CONTENT_TYPE_BY_DETECTED: Record<DetectedImageType, AvatarContentType> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function contentTypeOf(detected: DetectedImageType): AvatarContentType {
  return CONTENT_TYPE_BY_DETECTED[detected];
}

/**
 * Decides the real type from the first bytes. The declared content type and
 * the file name are attacker-controlled, so they are only a hint. SVG (text,
 * can carry script), GIF, HEIC and everything else return null.
 */
export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, i) => bytes[i] === byte)) {
    return 'png';
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function unsupportedImage(detail: string, code = 'unsupported_image'): ValidationError {
  return new ValidationError('The image cannot be used as an avatar', [
    { code, field: 'file', detail },
  ]);
}
