import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STYLES_DIR,
  blocksOf,
  block,
  contrast,
  mixOklab,
  readStyle,
  resolveToken,
  themeDeclarations,
  type Block,
} from './css';

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

  it('keeps dark values out of tokens.css and nothing but dark values in theme-dark.css', () => {
    expect(readStyle('tokens.css')).not.toMatch(/data-theme/);
    const darkPaths = blocksOf(readStyle('theme-dark.css')).map((b) => b.path);
    expect(darkPaths.length).toBeGreaterThan(0);
    for (const path of darkPaths) expect(path).toContain("[data-theme='dark']");
  });
});

// FR-UX-04, Design Foundations 4.3: every pair a component can put on screen
// meets WCAG 2.1 in both themes. 4.5:1 for text, 3:1 for non-text (control
// boundary, focus ring). The pairs mirror compro tokens.md 1.3 and 1.5 plus the
// platform additions (warning). Ratios are asserted as minimums so a token
// edit that lowers one fails; compro's own test pins the exact numbers.
type Pair = [fg: string, bg: string, minimum: number];

const SURFACES = ['--color-canvas', '--color-canvas-alt', '--color-surface', '--color-surface-tint'];
const TEXT = 4.5;
const NON_TEXT = 3;

function textPairs(): Pair[] {
  return [
    ...SURFACES.flatMap((bg): Pair[] => [
      ['--color-text', bg, TEXT],
      ['--color-text-secondary', bg, TEXT],
      ['--color-text-tertiary', bg, TEXT],
      ['--color-text-brand', bg, TEXT],
    ]),
    ['--color-text-inverse', '--color-action-primary', TEXT],
    ['--color-text-inverse', '--color-action-primary-hover', TEXT],
    ['--color-text-inverse', '--color-action-dark', TEXT],
    ['--color-text-inverse', '--color-surface-inverse', TEXT],
    ['--color-text-on-danger', '--color-danger', TEXT],
    ['--color-danger', '--color-canvas', TEXT],
    ['--color-danger', '--color-surface', TEXT],
    ['--color-danger', '--color-danger-surface', TEXT],
    ['--color-success', '--color-canvas', TEXT],
    ['--color-success', '--color-surface', TEXT],
    ['--color-success', '--color-success-surface', TEXT],
    ['--color-warning', '--color-surface', TEXT],
    ['--color-warning', '--color-warning-surface', TEXT],
    ['--color-text-tertiary', '--color-surface-warm', TEXT],
  ];
}

function nonTextPairs(): Pair[] {
  return [
    ['--color-border-input', '--color-canvas', NON_TEXT],
    ['--color-border-input', '--color-canvas-alt', NON_TEXT],
    ['--color-border-input', '--color-surface', NON_TEXT],
    ['--color-focus', '--color-canvas', NON_TEXT],
    ['--color-focus', '--color-canvas-alt', NON_TEXT],
    ['--color-focus', '--color-surface', NON_TEXT],
    ['--color-focus', '--color-surface-tint', NON_TEXT],
  ];
}

describe.each(['light', 'dark'] as const)('WCAG contrast in the %s theme (FR-UX-18)', (theme) => {
  const values = themeDeclarations(theme);
  const hex = (token: string) => resolveToken(values, token);

  it.each([...textPairs(), ...nonTextPairs()])('%s on %s is at least %s:1', (fg, bg, minimum) => {
    expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(minimum);
  });

  it('never lets brand teal 500 carry text: it fails 4.5:1 on the light canvas', () => {
    if (theme === 'light') {
      expect(contrast(hex('--teal-500'), hex('--color-canvas'))).toBeLessThan(TEXT);
    }
    expect(hex('--color-text-brand')).not.toBe(hex('--teal-500'));
    expect(hex('--color-link')).not.toBe(hex('--teal-500'));
  });

  it('keeps the visible values of FR-UX-04', () => {
    if (theme === 'light') {
      expect(hex('--color-canvas').toLowerCase()).toBe('#ffffff');
      expect(hex('--color-action-primary').toLowerCase()).toBe('#00686d');
      expect(hex('--color-text').toLowerCase()).toBe('#0b2a31');
    } else {
      expect(hex('--color-canvas').toLowerCase()).toBe('#08181c');
      expect(hex('--color-action-primary').toLowerCase()).toBe('#00686d');
      expect(hex('--color-text-inverse').toLowerCase()).toBe('#ffffff');
    }
  });
});

// Product accent ramps: 6 from compro, 7 proposed (FR-UX-13, FR-UX-17,
// FR-UX-18). The ramps are decorative and identity colors; text uses -700 in
// light and -300 in dark, and -500 never carries text or a meaningful icon.
const COMPRO_ACCENTS = ['people', 'finance', 'sales', 'social', 'help', 'insights'];
const PROPOSED_ACCENTS = ['desk', 'write', 'shop', 'guard', 'tax', 'legal', 'ops'];
const STEPS = ['--accent-50', '--accent-100', '--accent-300', '--accent-500', '--accent-700'] as const;

function ramps(file: string, keys: string[]): Array<[string, Record<(typeof STEPS)[number], string>]> {
  const blocks = blocksOf(readStyle(file));
  return keys.map((key) => {
    const declarations = block(blocks, `[data-product-accent='${key}']`);
    const ramp = Object.fromEntries(STEPS.map((step) => [step, declarations[step]!.toLowerCase()]));
    return [key, ramp as Record<(typeof STEPS)[number], string>];
  });
}

const ALL_RAMPS = [
  ...ramps('product-accents.css', COMPRO_ACCENTS),
  ...ramps('product-accents-proposed.css', PROPOSED_ACCENTS),
];

describe('product accent ramps (13 specialists)', () => {
  const light = themeDeclarations('light');
  const dark = themeDeclarations('dark');
  const white = resolveToken(light, '--white');
  const darkCanvas = resolveToken(dark, '--color-canvas');
  const darkSurface = resolveToken(dark, '--color-surface');

  it('has exactly 13 ramps, each with all five steps as hex', () => {
    expect(ALL_RAMPS.map(([key]) => key)).toEqual([...COMPRO_ACCENTS, ...PROPOSED_ACCENTS]);
    for (const [key, ramp] of ALL_RAMPS) {
      for (const step of STEPS) expect(ramp[step], `${key} ${step}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps the proposed ramps out of the vendored compro file', () => {
    const vendored = blocksOf(readStyle('product-accents.css')).map((b) => b.path);
    for (const key of PROPOSED_ACCENTS) expect(vendored).not.toContain(`[data-product-accent='${key}']`);
  });

  it.each(ALL_RAMPS)('%s: -700 text is at least 4.5:1 on white, -50 and -100', (key, ramp) => {
    expect(contrast(ramp['--accent-700'], white), `${key} on white`).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(ramp['--accent-700'], ramp['--accent-50']), `${key} on -50`).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(ramp['--accent-700'], ramp['--accent-100']), `${key} on -100`).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(PROPOSED_ACCENTS.map((key) => ALL_RAMPS.find(([k]) => k === key)!))(
    '%s (proposed): -700 meets the pre-check of 6.5:1 on white and 5.2:1 on -100',
    (key, ramp) => {
      expect(contrast(ramp['--accent-700'], white), `${key} on white`).toBeGreaterThanOrEqual(6.5);
      expect(contrast(ramp['--accent-700'], ramp['--accent-100']), `${key} on -100`).toBeGreaterThanOrEqual(5.2);
    },
  );

  it.each(ALL_RAMPS)('%s: dark -300 text is at least 4.5:1 on canvas, surface and its own tints', (key, ramp) => {
    const text = ramp['--accent-300'];
    expect(contrast(text, darkCanvas), `${key} on canvas`).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(text, darkSurface), `${key} on surface`).toBeGreaterThanOrEqual(TEXT);
    // accent-surface = 14% -500 over canvas, accent-tile = 24% -500 over surface.
    expect(contrast(text, mixOklab(ramp['--accent-500'], 14, darkCanvas)), `${key} on accent-surface`).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(text, mixOklab(ramp['--accent-500'], 24, darkSurface)), `${key} on accent-tile`).toBeGreaterThanOrEqual(TEXT);
  });

  it('keeps -500 decorative: it fails 3:1 on white for at least Coral, Gold, Leaf, Tangerine and Olive', () => {
    const failing = ALL_RAMPS.filter(([, ramp]) => contrast(ramp['--accent-500'], white) < NON_TEXT).map(([key]) => key);
    for (const key of ['people', 'finance', 'sales', 'write', 'ops']) expect(failing).toContain(key);
  });
});

describe('app-density layer', () => {
  const density = blocksOf(readStyle('app-density.css'));
  const vendoredTokens = new Set(
    VENDORED.flatMap((file) => blocksOf(readStyle(file)).flatMap((b) => Object.keys(b.declarations))),
  );

  it('never redefines a compro token', () => {
    const own = density.flatMap((b) => Object.keys(b.declarations));
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((token) => vendoredTokens.has(token))).toEqual([]);
  });

  it('has strictly increasing z-index layers in the documented order', () => {
    const root = block(density, ':root');
    const layers = Object.entries(root).filter(([token]) => token.startsWith('--z-'));
    expect(layers.map(([token]) => token)).toEqual([
      '--z-base',
      '--z-raised',
      '--z-sticky',
      '--z-nav',
      '--z-dropdown',
      '--z-drawer',
      '--z-modal',
      '--z-toast',
      '--z-tooltip',
      '--z-skip',
    ]);
    const numbers = layers.map(([, value]) => Number(value));
    for (let i = 1; i < numbers.length; i += 1) {
      expect(numbers[i], `${layers[i]![0]} must sit above ${layers[i - 1]![0]}`).toBeGreaterThan(numbers[i - 1]!);
    }
  });

  it('puts toast above modal and tooltip above toast', () => {
    const root = block(density, ':root');
    expect(Number(root['--z-toast'])).toBeGreaterThan(Number(root['--z-modal']));
    expect(Number(root['--z-tooltip'])).toBeGreaterThan(Number(root['--z-toast']));
  });

  it('defines the state overlays, warning and scrim tokens the components use', () => {
    const all = new Set(density.flatMap((b) => Object.keys(b.declarations)));
    for (const token of [
      '--state-hover',
      '--state-pressed',
      '--color-text-on-danger',
      '--color-warning',
      '--color-warning-surface',
      '--color-scrim',
      '--text-app-title',
      '--text-app-section',
      '--text-app-card',
    ]) {
      expect(all.has(token), token).toBe(true);
    }
  });

  it('swaps danger foreground, warning and scrim in dark without redefining vendored tokens', () => {
    const dark = block(density, ":root[data-theme='dark']");
    expect(Object.keys(dark).sort()).toEqual(['--color-scrim', '--color-text-on-danger', '--color-warning', '--color-warning-surface']);
  });
});

// A hex or functional color in component source, including inside a comment,
// would be copy-pasted into the next component. Components read tokens; raw
// values live in styles/*.css (FR-UX-05, FR-DS-05).
const SRC = resolve(import.meta.dirname, '..');
const FORBIDDEN = [
  { name: 'hex color', pattern: /(?<![\w&/])#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgb()/rgba()', pattern: /(?<![A-Za-z])rgba?\s*\(/i },
  { name: 'hsl()/hsla()', pattern: /(?<![A-Za-z])hsla?\s*\(/i },
  {
    name: 'Tailwind palette color',
    pattern:
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/,
  },
];

function componentSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'styles' ? [] : componentSources(path);
    }
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('no raw color in packages/ui components', () => {
  const files = componentSources(SRC);

  it('has component source to scan', () => {
    expect(files.length).toBeGreaterThan(2);
  });

  it.each(FORBIDDEN)('contains no $name', ({ pattern }) => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((text, index) => ({ file, line: index + 1, text }))
        .filter(({ text }) => pattern.test(text))
        .map(({ file: f, line, text }) => `${f.replace(SRC, 'src')}:${line}  ${text.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
