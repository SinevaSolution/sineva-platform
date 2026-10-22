import { describe, expect, it, vi } from 'vitest';
import { createTranslator, flattenMessages, formatMessage, messageParams, pseudoLocalize } from '@sineva/i18n';

describe('formatMessage', () => {
  it('substitutes named params', () => {
    expect(formatMessage('Hi {name}, {n} left', 'en-US', { name: 'Amira', n: 3 })).toBe('Hi Amira, 3 left');
  });

  it('formats number params for the locale', () => {
    expect(formatMessage('{n} / {max}', 'id-ID', { n: 7000, max: 8000 })).toBe('7.000 / 8.000');
    expect(formatMessage('{n} / {max}', 'en-US', { n: 7000, max: 8000 })).toBe('7,000 / 8,000');
  });

  it('throws on a param that was not supplied, so a gap never ships as "undefined"', () => {
    expect(() => formatMessage('Hi {name}', 'en-US', {})).toThrow(/name/);
  });

  it('keeps apostrophes literal', () => {
    expect(formatMessage("We couldn't reach Sino", 'en-US')).toBe("We couldn't reach Sino");
  });

  it('picks ICU plural branches for English', () => {
    const t = '{count, plural, =0 {No chats} one {# chat} other {# chats}}';
    expect(formatMessage(t, 'en-US', { count: 0 })).toBe('No chats');
    expect(formatMessage(t, 'en-US', { count: 1 })).toBe('1 chat');
    expect(formatMessage(t, 'en-US', { count: 2 })).toBe('2 chats');
  });

  it('uses only the other branch for Indonesian, which has no plural forms', () => {
    const t = '{count, plural, one {# obrolan} other {# obrolan}}';
    expect(formatMessage(t, 'id-ID', { count: 1 })).toBe('1 obrolan');
    expect(formatMessage(t, 'id-ID', { count: 1200 })).toBe('1.200 obrolan');
  });
});

describe('messageParams', () => {
  it('lists plain and plural params, each once', () => {
    expect(messageParams('Hi {name}, {name} has {count, plural, one {# chat} other {# chats}}').sort()).toEqual([
      'count',
      'name',
    ]);
  });

  it('returns nothing for a static string', () => {
    expect(messageParams('Send')).toEqual([]);
  });
});

describe('flattenMessages', () => {
  it('joins nested keys with dots', () => {
    expect(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' });
  });

  it('keeps an empty namespace out of the flat map', () => {
    expect(flattenMessages({ mcp: {}, a: 'x' })).toEqual({ a: 'x' });
  });
});

describe('createTranslator', () => {
  const messages = { auth: { sign_in: { title: 'Welcome back', hello: 'Hi {name}' } }, common: { send: 'Send' } };

  it('resolves keys inside a namespace', () => {
    const t = createTranslator(messages, 'auth', 'en-US');
    expect(t('sign_in.title')).toBe('Welcome back');
    expect(t('sign_in.hello', { name: 'Amira' })).toBe('Hi Amira');
  });

  it('exposes has() so callers can test for a key without rendering', () => {
    const t = createTranslator(messages, 'common', 'en-US');
    expect(t.has('send')).toBe(true);
    expect(t.has('nope')).toBe(false);
  });

  it('reports a missing key and shows its path, never another locale', () => {
    const onMissing = vi.fn();
    const t = createTranslator(messages, 'auth', 'en-US', onMissing);
    expect(t('sign_in.nope')).toBe('auth.sign_in.nope');
    expect(onMissing).toHaveBeenCalledWith('auth.sign_in.nope');
  });

  it('treats a namespace node as missing, not as text', () => {
    const onMissing = vi.fn();
    const t = createTranslator(messages, 'auth', 'en-US', onMissing);
    expect(t('sign_in')).toBe('auth.sign_in');
    expect(onMissing).toHaveBeenCalled();
  });
});

describe('pseudoLocalize', () => {
  it('accents letters and grows the text by about 40 percent', () => {
    const source = 'Sign in to your account today';
    const out = pseudoLocalize(source);
    expect(out).not.toBe(source);
    expect(out.length).toBeGreaterThanOrEqual(Math.ceil(source.length * 1.4));
  });

  it('leaves {params} and ICU structure intact so formatting still works', () => {
    const out = pseudoLocalize('Hi {name}, you have {count, plural, one {# chat} other {# chats}}');
    expect(messageParams(out).sort()).toEqual(['count', 'name']);
    expect(formatMessage(out, 'en-US', { name: 'A', count: 2 })).toContain('2');
  });

  it('wraps the text in markers so clipping is visible', () => {
    const out = pseudoLocalize('Save');
    expect(out.startsWith('[')).toBe(true);
    expect(out.endsWith(']')).toBe(true);
  });
});
