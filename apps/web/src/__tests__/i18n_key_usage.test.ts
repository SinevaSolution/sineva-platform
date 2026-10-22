import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeKeyUsage, flattenMessages } from '@sineva/i18n';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

const SRC = resolve(import.meta.dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('key usage analysis on fixtures', () => {
  const catalog = flattenMessages({
    auth: { title: 'T', sign_in: { cta: 'Go' } },
    common: { cancel: 'Cancel' },
    shell: { features: { inbox: { label: 'Inbox' } } },
  });

  it('flags a key used in code but absent from the catalog', () => {
    const report = analyzeKeyUsage(catalog, [
      {
        path: 'a.tsx',
        source: `const t = useTranslations('auth'); t('title'); t('sign_in.cta'); t('nope.here');`,
      },
    ]);
    expect(report.missing).toEqual(['auth.nope.here']);
  });

  it('flags a catalog key nothing references', () => {
    const report = analyzeKeyUsage(catalog, [
      { path: 'a.tsx', source: `const t = useTranslations('auth'); t('title'); t('sign_in.cta');` },
    ]);
    expect(report.unused.sort()).toEqual(['common.cancel', 'shell.features.inbox.label']);
  });

  it('follows the variable name bound to each namespace, including server getTranslations', () => {
    const report = analyzeKeyUsage(catalog, [
      {
        path: 'b.tsx',
        source: `const tCommon = await getTranslations('common'); tCommon('cancel');`,
      },
    ]);
    expect(report.missing).toEqual([]);
    expect(report.unused).not.toContain('common.cancel');
  });

  it('counts t.rich and t.has calls', () => {
    const report = analyzeKeyUsage(catalog, [
      { path: 'c.tsx', source: `const t = useTranslations('auth'); t.rich('title', {}); t.has('sign_in.cta');` },
    ]);
    expect(report.unused).not.toContain('auth.title');
    expect(report.unused).not.toContain('auth.sign_in.cta');
  });

  it('accepts a multi-segment key held as a string literal in a model file', () => {
    const report = analyzeKeyUsage(catalog, [
      { path: 'nav.ts', source: `export const LABEL = 'features.inbox.label';` },
      { path: 'a.tsx', source: `const t = useTranslations('auth'); t('title'); t('sign_in.cta');` },
    ]);
    expect(report.unused).not.toContain('shell.features.inbox.label');
  });

  it('does not let a stray single-word literal keep a one-segment key alive', () => {
    const report = analyzeKeyUsage(catalog, [{ path: 'x.ts', source: `const label = 'cancel';` }]);
    expect(report.unused).toContain('common.cancel');
  });

  it('forbids template-literal keys, which no extractor can follow', () => {
    const report = analyzeKeyUsage(catalog, [
      { path: 'd.tsx', source: 'const t = useTranslations(\'auth\'); t(`sign_in.${x}`);' },
    ]);
    expect(report.dynamic).toEqual(['d.tsx']);
  });

  it('ignores comments', () => {
    const report = analyzeKeyUsage(catalog, [
      { path: 'e.tsx', source: `// t('ghost.key')\nconst t = useTranslations('auth'); t('title'); t('sign_in.cta');` },
    ]);
    expect(report.missing).toEqual([]);
  });
});

describe('key usage in the app', () => {
  const files = walk(SRC)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${join(SRC, '__tests__')}`))
    .map((f) => ({ path: relative(SRC, f), source: readFileSync(f, 'utf8') }));

  it('references no key that is missing from the catalogs, and no template-literal keys', () => {
    for (const catalog of [en, id]) {
      const report = analyzeKeyUsage(flattenMessages(catalog), files);
      expect(report.missing).toEqual([]);
      expect(report.dynamic).toEqual([]);
    }
  });

  it('leaves no catalog key unused', () => {
    for (const catalog of [en, id]) {
      expect(analyzeKeyUsage(flattenMessages(catalog), files).unused).toEqual([]);
    }
  });
});
