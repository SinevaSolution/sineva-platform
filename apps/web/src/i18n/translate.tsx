import * as React from 'react';
import {
  createTranslator,
  formatMessage,
  intlLocaleFor,
  type Messages,
  type MessageParams,
  type Translator,
} from '@sineva/i18n';

export type RichParams = Readonly<Record<string, string | number | React.ReactNode>>;

/** `t(key, params)` for text, `t.rich(key, params)` when a param is an element (a link, `<strong>`). */
export interface AppTranslator extends Translator {
  rich(key: string, params: RichParams): React.ReactNode;
}

// Rich params are swapped for a sentinel before ICU formatting and split back
// out afterwards, so a translator can put the element anywhere in the
// sentence (word order differs between English and Indonesian).
const SENTINEL = '\u0001';
const SPLIT = new RegExp(`${SENTINEL}(\\w+)${SENTINEL}`);

export function createAppTranslator(messages: Messages, namespace: string, locale: string): AppTranslator {
  const intl = intlLocaleFor(locale);
  const base = createTranslator(messages, namespace, intl);
  const t = ((key: string, params?: MessageParams) => base(key, params)) as AppTranslator;
  t.has = base.has;
  t.raw = base.raw;
  t.rich = (key, params) => {
    const template = base.raw(key);
    if (template === undefined) return base(key);
    const text: Record<string, string | number> = {};
    const nodes: Record<string, React.ReactNode> = {};
    for (const [name, value] of Object.entries(params)) {
      if (typeof value === 'string' || typeof value === 'number') {
        text[name] = value;
      } else {
        nodes[name] = value;
        text[name] = `${SENTINEL}${name}${SENTINEL}`;
      }
    }
    return formatMessage(template, intl, text)
      .split(SPLIT)
      .map((part, index) =>
        index % 2 === 0 ? part : <React.Fragment key={index}>{nodes[part]}</React.Fragment>,
      );
  };
  return t;
}
