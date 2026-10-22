import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// FR-DS-02: the package layout every later component lands in.
const SRC = resolve(import.meta.dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(SRC).filter(
  (file) =>
    /\.(ts|tsx)$/.test(file) &&
    !file.includes('/__tests__/') &&
    !/\.test\.tsx?$/.test(file),
);

describe('packages/ui structure (FR-DS-02)', () => {
  it.each(['styles', 'lib', 'primitives', 'shell', 'chat', 'domain'])('has src/%s/', (dir) => {
    expect(existsSync(join(SRC, dir)) && statSync(join(SRC, dir)).isDirectory()).toBe(true);
  });

  it('has the lib helpers: cx, focus and format', () => {
    for (const file of ['cx.ts', 'focus.ts', 'format.ts']) {
      expect(existsSync(join(SRC, 'lib', file)), file).toBe(true);
    }
  });

  it.each(['primitives', 'shell', 'chat', 'domain'])('%s/ has an index barrel', (dir) => {
    expect(existsSync(join(SRC, dir, 'index.ts'))).toBe(true);
  });

  it('has an index.ts with named exports only', () => {
    const index = readFileSync(join(SRC, 'index.ts'), 'utf8');
    expect(index).not.toMatch(/export\s+default/);
    expect(index).not.toMatch(/export\s+\*/);
    expect(index).toMatch(/export\s*\{[^}]*\bButton\b[^}]*\}/);
  });

  it('has no default exports anywhere in the package', () => {
    const offenders = sources.filter((file) => /export\s+default\b/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.replace(SRC, 'src'))).toEqual([]);
  });

  it('gives every component folder x.tsx, x.test.tsx and x.gallery.tsx', () => {
    const missing: string[] = [];
    for (const group of ['primitives', 'shell', 'chat', 'domain']) {
      const groupDir = join(SRC, group);
      for (const entry of readdirSync(groupDir)) {
        const folder = join(groupDir, entry);
        if (!statSync(folder).isDirectory()) continue;
        for (const suffix of ['.tsx', '.test.tsx', '.gallery.tsx']) {
          if (!existsSync(join(folder, `${entry}${suffix}`))) missing.push(`${group}/${entry}/${entry}${suffix}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses tailwind-merge only in the legacy primitives, never in new components (static class maps)', () => {
    const users = sources
      .filter((file) => /from\s+['"]tailwind-merge['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(`${SRC}/`, ''));
    expect(users).toEqual(['primitives/legacy.tsx']);
  });
});
