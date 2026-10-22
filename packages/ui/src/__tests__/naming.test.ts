import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as cards from '../cards';
import * as ui from '../index';

// Every design-system component is named with the SN prefix (ADR-0028). The
// runtime check covers values (components, hooks, helpers); the source check
// covers type-only exports, which do not exist at runtime.
const SRC = resolve(import.meta.dirname, '..');

// PascalCase exports are components or component types. Helpers and hooks are
// camelCase and SCREAMING_CASE constants are not checked.
const isComponentName = (name: string) => /^[A-Z]/.test(name) && /[a-z]/.test(name) && !name.includes('_');

function barrelExports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const names: string[] = [];
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

describe('SN naming rule (ADR-0028)', () => {
  it('starts every exported component of @sineva/ui with SN', () => {
    const offenders = Object.keys(ui).filter((name) => isComponentName(name) && !name.startsWith('SN'));
    expect(offenders).toEqual([]);
  });

  it('starts every exported component of @sineva/ui/cards with SN', () => {
    const offenders = Object.keys(cards).filter((name) => isComponentName(name) && !name.startsWith('SN'));
    expect(offenders).toEqual([]);
  });

  it('starts every exported type in the barrels with SN', () => {
    const barrels = ['index.ts', 'cards/index.ts', 'primitives/index.ts', 'shell/index.ts', 'chat/index.ts', 'domain/index.ts'];
    const offenders = barrels.flatMap((barrel) =>
      barrelExports(join(SRC, barrel))
        .filter((name) => isComponentName(name) && !name.startsWith('SN'))
        .map((name) => `${barrel}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it('names every component folder with sn_', () => {
    const offenders: string[] = [];
    for (const group of ['primitives', 'shell', 'chat', 'domain']) {
      const groupDir = join(SRC, group);
      for (const entry of readdirSync(groupDir)) {
        if (!statSync(join(groupDir, entry)).isDirectory()) continue;
        if (!entry.startsWith('sn_')) offenders.push(`${group}/${entry}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('exports every SN component declared in a primitives folder', () => {
    const exported = new Set(Object.keys(ui));
    const missing: string[] = [];
    const dir = join(SRC, 'primitives');
    for (const entry of readdirSync(dir)) {
      if (!statSync(join(dir, entry)).isDirectory()) continue;
      const source = readFileSync(join(dir, entry, `${entry}.tsx`), 'utf8');
      for (const match of source.matchAll(/export\s+(?:function|const)\s+(SN[A-Za-z]+)/g)) {
        if (!exported.has(match[1] as string)) missing.push(`${entry}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
