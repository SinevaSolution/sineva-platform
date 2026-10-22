// Avatar upload limits, shared so the browser can refuse a bad file before
// uploading it. The server re-checks everything from the bytes.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
