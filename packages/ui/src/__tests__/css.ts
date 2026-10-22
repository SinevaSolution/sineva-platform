// Shared CSS reading helpers for the token tests. The reader itself lives with
// the sync script so the generator and the tests can never disagree about what
// a "declaration" is.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain .mjs without type declarations
import { readCustomProperties, stripComments } from '../../scripts/css_tokens.mjs';

export interface Block {
  path: string;
  declarations: Record<string, string>;
}

export const STYLES_DIR = resolve(import.meta.dirname, '../styles');

export function readStyle(name: string): string {
  return readFileSync(resolve(STYLES_DIR, name), 'utf8');
}

export function blocksOf(css: string): Block[] {
  return readCustomProperties(css) as Block[];
}

export function withoutComments(css: string): string {
  return stripComments(css) as string;
}

/** First block whose selector or at-rule path ends with `path`. */
export function block(blocks: Block[], path: string): Record<string, string> {
  const found = blocks.find((b) => b.path === path);
  if (!found) throw new Error(`no block "${path}"`);
  return found.declarations;
}
