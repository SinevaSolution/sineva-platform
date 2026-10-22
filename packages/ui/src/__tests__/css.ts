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

/** Declarations of the block whose selector or at-rule path is exactly `path`. */
export function block(blocks: Block[], path: string): Record<string, string> {
  const found = blocks.find((b) => b.path === path);
  if (!found) throw new Error(`no block "${path}"`);
  return found.declarations;
}

const LIGHT_PATHS = new Set([':root', '@theme static']);
const DARK_PATH = ":root[data-theme='dark']";

/** The custom properties of one theme, later declarations overriding earlier ones. */
export function themeDeclarations(theme: 'light' | 'dark'): Map<string, string> {
  const values = new Map<string, string>();
  const files = ['tokens.css', 'app-density.css'].map((f) => blocksOf(readStyle(f)));
  for (const blocks of files) {
    for (const b of blocks) {
      if (LIGHT_PATHS.has(b.path)) for (const [k, v] of Object.entries(b.declarations)) values.set(k, v);
    }
  }
  if (theme === 'dark') {
    const darkFiles = ['theme-dark.css', 'app-density.css'].map((f) => blocksOf(readStyle(f)));
    for (const blocks of darkFiles) {
      for (const b of blocks) {
        if (b.path === DARK_PATH) for (const [k, v] of Object.entries(b.declarations)) values.set(k, v);
      }
    }
  }
  return values;
}

/** Follows `var(--x)` chains until a literal value. Throws on a missing token. */
export function resolveToken(values: Map<string, string>, token: string): string {
  const value = values.get(token);
  if (value === undefined) throw new Error(`${token} is not declared`);
  const ref = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  return ref ? resolveToken(values, ref[1]!) : value;
}

// WCAG 2.1 relative luminance and contrast ratio.
function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`not a 6 digit hex: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// `color-mix(in oklab, ...)` is not available in Node, so the dark accent
// surfaces are mixed here with the CSS Color 4 OKLab matrices, to check the
// contrast of the text that sits on them.
function toOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function mixOklab(top: string, percent: number, base: string): string {
  const [a, b] = [toOklab(top), toOklab(base)];
  const [L, A, B] = a.map((v, i) => v * (percent / 100) + b[i]! * (1 - percent / 100)) as [number, number, number];
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const hex = lin
    .map((c) => {
      const v = Math.min(1, Math.max(0, c));
      const enc = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(enc * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
  return `#${hex}`;
}
