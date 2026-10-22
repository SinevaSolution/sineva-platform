import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STYLES_DIR, blocksOf, readStyle, type Block } from './css';

interface Snapshot {
  compro_commit: string;
  files: Record<string, Block[]>;
}

const VENDORED = ['tokens.css', 'theme-dark.css', 'product-accents.css'] as const;

function readSnapshot(): Snapshot {
  return JSON.parse(readFileSync(resolve(STYLES_DIR, 'tokens.snapshot.json'), 'utf8')) as Snapshot;
}

// FR-UX-02: the vendored CSS is a copy of sineva-compro. The snapshot records
// compro's values; a hand edit of a vendored file (or a stale re-vendor) makes
// the two disagree and fails here instead of shipping a second token set.
describe('token drift: vendored CSS equals the compro snapshot (FR-UX-02)', () => {
  it('has a snapshot that names the compro commit', () => {
    expect(readSnapshot().compro_commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(VENDORED)('%s carries the compro commit in its header', (file) => {
    const head = readStyle(file).split('*/')[0] ?? '';
    expect(head).toContain(readSnapshot().compro_commit);
  });

  it.each(VENDORED)('%s declares exactly the snapshot values', (file) => {
    expect(blocksOf(readStyle(file))).toEqual(readSnapshot().files[file]);
  });

  it('keeps dark values out of tokens.css and light values out of theme-dark.css', () => {
    expect(readStyle('tokens.css')).not.toMatch(/data-theme/);
    expect(readStyle('theme-dark.css').trimStart()).toMatch(/^\/\*[\s\S]*?\*\/\s*:root\[data-theme='dark'\]/);
  });
});
