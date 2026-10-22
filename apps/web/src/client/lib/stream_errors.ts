// Error copy for the chat stream. Copy always maps from the machine `code`,
// never from the server's `message` (FR-UX-31): the server text is for logs
// and may change; the codes are the contract. The keys are next-intl ready;
// until the message catalogs land (WP-M0-42) the English copy lives here.

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

const COPY: Record<StreamErrorKey, (name: string) => string> = {
  'chat.error.unavailable': (name) =>
    `${name} can't reply right now. Your message is saved, so you can try again in a moment.`,
  'chat.error.interrupted': (name) =>
    `${name}'s reply was cut short. Your message is saved, so you can send it again.`,
  'chat.error.connection_lost': () =>
    'The connection dropped before the reply finished. Check your connection and try again.',
  'chat.error.signed_out': () => 'Your session ended. Sign in again to continue.',
  'chat.error.forbidden': () => "You don't have access to this yet. Ask an admin.",
  'chat.error.not_found': () => "This reply couldn't be found. Reload the chat to see where things stand.",
  'chat.error.rate_limited': () => 'Too many tries. Wait a moment, then try again.',
  'chat.error.generic': (name) => `Something went wrong while ${name} was replying. Try again.`,
};

export function streamErrorMessage(code: string, companionName = 'Sino'): string {
  return COPY[streamErrorMessageKey(code)](companionName);
}
