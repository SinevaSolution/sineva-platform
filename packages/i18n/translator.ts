import { formatMessage, type MessageParams } from './format_message';

/** A catalog: nested objects whose leaves are message strings. */
export interface Messages {
  [key: string]: string | Messages;
}

/** `{ 'auth.sign_in.title': 'Welcome back' }`; empty namespaces such as the reserved `mcp` vanish. */
export function flattenMessages(messages: Messages, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      flat[path] = value;
    } else if (value !== null && typeof value === 'object') {
      Object.assign(flat, flattenMessages(value, path));
    } else {
      throw new Error(`Message "${path}" must be a string or an object`);
    }
  }
  return flat;
}

export interface Translator {
  (key: string, params?: MessageParams): string;
  /** True when the key resolves to a message in this locale. */
  has(key: string): boolean;
  /** The unformatted message, for callers that substitute rich parts themselves. */
  raw(key: string): string | undefined;
}

const flatCache = new WeakMap<Messages, Record<string, string>>();

function flatOf(messages: Messages): Record<string, string> {
  let flat = flatCache.get(messages);
  if (!flat) {
    flat = flattenMessages(messages);
    flatCache.set(messages, flat);
  }
  return flat;
}

/**
 * Translator for one namespace of one locale's catalog.
 *
 * A missing key returns its own path, which is visibly wrong on screen, and
 * is reported through `onMissing`. It never reaches for another locale: the
 * catalog check in CI is what keeps keys complete, and a silent English
 * fallback inside the Indonesian UI would hide exactly the gaps it exists to
 * catch.
 */
export function createTranslator(
  messages: Messages,
  namespace: string,
  intlLocale: string,
  onMissing: (path: string) => void = (path) => console.error(`[i18n] missing message: ${path}`),
): Translator {
  const flat = flatOf(messages);
  const full = (key: string) => (namespace ? `${namespace}.${key}` : key);

  const t = ((key: string, params?: MessageParams) => {
    const path = full(key);
    const template = flat[path];
    if (template === undefined) {
      onMissing(path);
      return path;
    }
    return formatMessage(template, intlLocale, params);
  }) as Translator;
  t.has = (key: string) => flat[full(key)] !== undefined;
  t.raw = (key: string) => flat[full(key)];
  return t;
}
