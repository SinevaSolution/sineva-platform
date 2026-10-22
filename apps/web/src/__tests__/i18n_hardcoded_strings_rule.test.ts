import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import rule from '../../eslint-rules/no-hardcoded-strings.mjs';

function lint(code: string): string[] {
  const linter = new Linter({ configType: 'flat' });
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.tsx'],
        languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { sineva: { rules: { 'no-hardcoded-strings': rule } } },
        rules: { 'sineva/no-hardcoded-strings': 'error' },
      },
    ],
    { filename: 'fixture.tsx' },
  );
  return messages.map((m) => m.messageId ?? m.message);
}

describe('no-hardcoded-strings: violating fixtures must fail', () => {
  it('flags literal text inside an element', () => {
    expect(lint('export const A = () => <p>Sign in to continue</p>;')).toEqual(['jsxText']);
  });

  it('flags text next to an expression', () => {
    expect(lint('export const A = ({n}: {n: string}) => <p>Hello {n}</p>;')).toEqual(['jsxText']);
  });

  it('flags a string literal child expression', () => {
    expect(lint("export const A = () => <p>{'Sign in'}</p>;")).toEqual(['jsxText']);
  });

  it.each(['placeholder', 'title', 'alt', 'aria-label', 'label', 'hint', 'aria-description'])(
    'flags a literal %s attribute',
    (attr) => {
      expect(lint(`export const A = () => <input ${attr}="Your email" />;`)).toEqual(['jsxAttribute']);
    },
  );

  it('flags a literal inside an attribute expression', () => {
    expect(lint(`export const A = () => <input aria-label={'Your email'} />;`)).toEqual(['jsxAttribute']);
  });

  it('flags literal toast text', () => {
    expect(lint("toast.error('Could not save');")).toEqual(['toastLiteral']);
    expect(lint("toast.success('Saved');")).toEqual(['toastLiteral']);
  });

  it('flags literal text in exported page metadata', () => {
    expect(lint("export const metadata = { title: 'Sign in', description: 'Welcome back' };")).toEqual([
      'metadataLiteral',
      'metadataLiteral',
    ]);
  });
});

describe('no-hardcoded-strings: allowed shapes', () => {
  it('allows translated text', () => {
    expect(lint("export const A = () => <p>{t('title')}</p>;")).toEqual([]);
  });

  it('allows whitespace, punctuation and numbers, which carry no copy', () => {
    expect(lint('export const A = () => <p>{a} / {b} · 12 -</p>;')).toEqual([]);
  });

  it('allows an empty alt for decorative images', () => {
    expect(lint('export const A = () => <img alt="" src="/a.png" />;')).toEqual([]);
  });

  it('allows non-copy attributes such as className, href and id', () => {
    expect(lint('export const A = () => <a className="text-sm font-medium" href="/sign-in" id="x" />;')).toEqual([]);
  });

  it('allows the brand wordmark', () => {
    expect(lint('export const A = () => <span>sineva</span>;')).toEqual([]);
  });

  it('allows a dynamic metadata title', () => {
    expect(lint("export const metadata = { title: t('title') };")).toEqual([]);
  });

  it('lets a line opt out with a reason', () => {
    const code = [
      'export const A = () => (',
      '  // eslint-disable-next-line sineva/no-hardcoded-strings -- provider name, not copy',
      '  <span>Google</span>',
      ');',
    ].join('\n');
    expect(lint(code)).toEqual([]);
  });
});
