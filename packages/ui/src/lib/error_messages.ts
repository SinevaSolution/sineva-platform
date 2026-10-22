// Maps a machine error `code` to a key in the `errors` message namespace
// (FR-UX-31). The copy a person reads comes from the catalog entry under that
// key, never from the API `message` (English, developer-facing, may name
// internals).
//
// Mirrors `CODE_KEYS` and `DETAIL_KEYS` in apps/web/src/client/lib/api.ts and
// the `errors.api.*` entries in apps/web/messages/en.json; keep the three in
// step. Unlike `apiErrorKey` there is no HTTP-status step: this takes a code
// only, and an unknown code falls back to `api.generic` like the app does.
//
// A Map, not an object literal lookup: with a plain object, a code such as
// `constructor` or `__proto__` would resolve to an inherited property.
const KEYS: ReadonlyMap<string, string> = new Map([
  // Envelope codes.
  ['network', 'api.network'],
  ['unauthenticated', 'api.unauthenticated'],
  ['forbidden', 'api.forbidden'],
  ['not_found', 'api.not_found'],
  ['conflict', 'api.conflict'],
  ['validation_failed', 'api.validation_failed'],
  ['rate_limited', 'api.rate_limited'],
  ['internal_error', 'api.internal_error'],
  ['model_unavailable', 'api.model_unavailable'],
  ['dependency_unavailable', 'api.dependency_unavailable'],
  // Detail codes (`errors[].code`): a breached password needs a different fix
  // than a short one, so these win over the envelope code in the app.
  ['breached_password', 'api.breached_password'],
  ['invalid_password', 'api.invalid_password'],
  ['terms_required', 'api.terms_required'],
  ['privacy_required', 'api.privacy_required'],
  ['unsupported_image', 'api.unsupported_image'],
  ['image_too_large', 'api.image_too_large'],
  ['invalid_image', 'api.invalid_image'],
  ['upload_failed', 'api.upload_failed'],
]);

const FALLBACK_KEY = 'api.generic';

export function errorCodeToMessageKey(code: string): string {
  return KEYS.get(code) ?? FALLBACK_KEY;
}
