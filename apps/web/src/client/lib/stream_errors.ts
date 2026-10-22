// Error copy for the chat stream. Copy always maps from the machine `code`,
// never from the server's `message` (FR-UX-31): the server text is for logs
// and may change; the codes are the contract. The keys are paths in the `chat`
// namespace of messages/en.json and id.json.

export type StreamErrorKey =
  | 'chat.error.unavailable'
  | 'chat.error.interrupted'
  | 'chat.error.connection_lost'
  | 'chat.error.signed_out'
  | 'chat.error.forbidden'
  | 'chat.error.not_found'
  | 'chat.error.rate_limited'
  | 'chat.error.generic';

const KEY_BY_CODE: Record<string, StreamErrorKey> = {
  upstream_unavailable: 'chat.error.unavailable',
  model_unavailable: 'chat.error.unavailable',
  dependency_unavailable: 'chat.error.unavailable',
  upstream_error: 'chat.error.unavailable',
  upstream_interrupted: 'chat.error.interrupted',
  upstream_bad_response: 'chat.error.interrupted',
  connection_lost: 'chat.error.connection_lost',
  unauthenticated: 'chat.error.signed_out',
  forbidden: 'chat.error.forbidden',
  not_found: 'chat.error.not_found',
  rate_limited: 'chat.error.rate_limited',
};

export function streamErrorMessageKey(code: string): StreamErrorKey {
  return KEY_BY_CODE[code] ?? 'chat.error.generic';
}

/**
 * Text for a stream error code, in the active language. `t` is a translator
 * with an empty namespace so the keys above resolve as full catalog paths.
 */
export function streamErrorText(
  t: (key: string, params?: Record<string, string | number>) => string,
  code: string,
  companionName = 'Sino',
): string {
  return t(streamErrorMessageKey(code), { name: companionName });
}
