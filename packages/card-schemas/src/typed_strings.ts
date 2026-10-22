// Rules for the strings inside card data (FR-AX-09, FR-AX-50).
//
// Ajv checks shape, size and patterns. It cannot express "this string is a URL
// and must be https" for one field and "this string must not look like a URL"
// for the others, so the schema carries annotations (`x-link`, `x-contact`,
// `x-media-ref`, `x-sanitize`) and these functions walk schema and data side
// by side. Both walks run on data Ajv already accepted, so the data shape is
// known to match the schema.

export type TypedStringCode = 'bad_link' | 'bad_contact' | 'bad_media_ref' | 'untyped_url';

type Schema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Bidi controls and zero-width characters. They let a name read as another
// string or hide a scheme, so they never survive in names, subjects or addresses.
// U+200D (zero-width joiner) is included on purpose: emoji sequences lose
// their joiner, which is an accepted cost in fields that are not free prose.
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE, '');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAILTO = /^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
const TEL = /^tel:\+?[0-9][0-9\-\s().]{3,30}$/i;
// A scheme at the start (after the whitespace and control characters a browser
// ignores) is a smuggled URL. A bare "https://" anywhere is one too. A plain
// "data:" or "tel:" in the middle of prose is not, or ordinary sentences would
// be rejected.
const SCHEME_AT_START = /^(?:https?|javascript|data|vbscript|file|blob|ftp|mailto|tel|sms):/i;
const URL_ANYWHERE = /\b(?:https?|ftp|file):\/\//i;

function hasControlOrEdgeSpace(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return value !== value.trim() || /[\u0000-\u001F\u007F]/.test(value);
}

function checkLink(value: string): boolean {
  if (hasControlOrEdgeSpace(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // Credentials in a URL are a phishing device (https://bank.com@evil.com).
  return url.protocol === 'https:' && url.username === '' && url.password === '';
}

function checkContact(value: string): boolean {
  return MAILTO.test(value) || TEL.test(value);
}

function checkPlain(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const compact = value.replace(/[\u0000- \u007F]/g, '');
  return !SCHEME_AT_START.test(compact) && !URL_ANYWHERE.test(value);
}

function resolve(root: Schema, node: Schema): Schema {
  const ref = node['$ref'];
  if (typeof ref !== 'string') return node;
  let current: unknown = root;
  for (const part of ref.replace(/^#\//, '').split('/')) {
    current = isRecord(current) ? current[part] : undefined;
  }
  return isRecord(current) ? current : node;
}

/** Returns a deep copy with invisible characters removed from `x-sanitize` strings. */
export function sanitizeData(root: Schema, data: unknown): unknown {
  const walk = (schemaNode: Schema, value: unknown): unknown => {
    const node = resolve(root, schemaNode);
    if (typeof value === 'string') {
      return node['x-sanitize'] === true ? stripInvisible(value) : value;
    }
    if (Array.isArray(value)) {
      const items = isRecord(node['items']) ? node['items'] : {};
      return value.map((item) => walk(items, item));
    }
    if (isRecord(value)) {
      const properties = isRecord(node['properties']) ? node['properties'] : {};
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        const childSchema = properties[key];
        out[key] = isRecord(childSchema) ? walk(childSchema, child) : child;
      }
      return out;
    }
    return value;
  };
  return walk(root, data);
}

/** First typed-string violation in `data`, or null. */
export function checkTypedStrings(root: Schema, data: unknown): TypedStringCode | null {
  let failure: TypedStringCode | null = null;
  const walk = (schemaNode: Schema, value: unknown): void => {
    if (failure) return;
    const node = resolve(root, schemaNode);
    if (typeof value === 'string') {
      if (node['x-link'] === true) {
        if (!checkLink(value)) failure = 'bad_link';
      } else if (node['x-contact'] === true) {
        if (!checkContact(value)) failure = 'bad_contact';
      } else if (node['x-media-ref'] === true) {
        if (!UUID.test(value)) failure = 'bad_media_ref';
      } else if (!checkPlain(value)) {
        failure = 'untyped_url';
      }
      return;
    }
    if (Array.isArray(value)) {
      const items = isRecord(node['items']) ? node['items'] : {};
      for (const item of value) walk(items, item);
      return;
    }
    if (isRecord(value)) {
      const properties = isRecord(node['properties']) ? node['properties'] : {};
      for (const [key, child] of Object.entries(value)) {
        const childSchema = properties[key];
        if (isRecord(childSchema)) walk(childSchema, child);
      }
    }
  };
  walk(root, data);
  return failure;
}
