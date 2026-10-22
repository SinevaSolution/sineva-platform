import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = resolve(import.meta.dirname, '../..');
const SRC = join(WEB, 'src');
const UI_STYLES = resolve(WEB, '../../packages/ui/src/styles');

const read = (path: string) => readFileSync(path, 'utf8');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const appSources = walk(SRC).filter(
  (file) => /\.(ts|tsx|css)$/.test(file) && !file.includes('/__tests__/'),
);

describe('design token wiring (FR-UX-01, FR-UX-05, FR-UX-06, FR-UX-42)', () => {
  const globals = read(join(SRC, 'app/globals.css'));

  it('imports tailwindcss, tokens, dark, accents, app density in that order', () => {
    const imports = [...globals.matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(imports.map((i) => i.split('/').pop())).toEqual([
      'tailwindcss',
      'tokens.css',
      'theme-dark.css',
      'product-accents.css',
      'product-accents-proposed.css',
      'app-density.css',
    ]);
    for (const file of imports.slice(1)) {
      expect(existsSync(resolve(SRC, 'app', file)), `${file} should resolve`).toBe(true);
    }
  });

  it('holds no token values of its own: no hex and no :root or data-theme blocks', () => {
    const css = globals.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/:root|data-theme/);
    expect(css).not.toMatch(/@theme/);
  });

  it('keeps every motion keyframe the scenes, rooms and shell use', () => {
    for (const name of ['rise', 'float', 'spin', 'spin-reverse', 'drift', 'fade-swap', 'fade-in', 'dash']) {
      expect(globals, name).toContain(`@keyframes ${name}`);
    }
  });

  it('removes every Tailwind dark: variant from app sources', () => {
    const offenders = appSources.filter((file) => /(^|[\s"'`:])dark:/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('does not use next-themes or the motion package anywhere', () => {
    const offenders = appSources.filter((file) =>
      /from\s+['"](next-themes|motion|motion\/[^'"]*|framer-motion)['"]/.test(read(file)),
    );
    expect(offenders).toEqual([]);
    const pkg = JSON.parse(read(join(WEB, 'package.json'))) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['next-themes']).toBeUndefined();
    expect(pkg.dependencies['motion']).toBeUndefined();
  });

  it('configures the fonts as compro does (variable fonts, two subsets, swap)', () => {
    const fonts = read(join(SRC, 'styles/fonts.ts'));
    expect(fonts).toMatch(/from 'next\/font\/google'/);
    expect(fonts.match(/subsets: \['latin', 'latin-ext'\]/g)).toHaveLength(2);
    expect(fonts.match(/display: 'swap'/g)).toHaveLength(2);
    expect(fonts).not.toMatch(/weight: \[/);
    expect(fonts).toContain("variable: '--font-plus-jakarta-sans'");
    expect(fonts).toContain("variable: '--font-geist-mono'");
    expect(read(join(UI_STYLES, 'tokens.css'))).toMatch(
      /--font-sans:\s*var\(--font-plus-jakarta-sans\)/,
    );
  });

  it('applies both font variables on <html> and renders the theme script in <head>', () => {
    const layout = read(join(SRC, 'app/layout.tsx'));
    expect(layout).toMatch(/from '@\/styles\/fonts'/);
    expect(layout).toContain('plusJakartaSans.variable');
    expect(layout).toContain('geistMono.variable');
    expect(layout).toMatch(/<head>[\s\S]*<ThemeScript nonce=\{nonce\}[\s\S]*<\/head>/);
  });

  it('uses the compro canvas-alt values as the browser theme color', () => {
    const layout = read(join(SRC, 'app/layout.tsx'));
    const dark = read(join(UI_STYLES, 'theme-dark.css')).match(/--color-canvas-alt:\s*(#[0-9a-f]{6})/i)![1]!;
    const light = read(join(UI_STYLES, 'tokens.css')).match(/--ink-50:\s*(#[0-9a-f]{6})/i)![1]!;
    expect(layout.toLowerCase()).toContain(`color: '${light}'`);
    expect(layout.toLowerCase()).toContain(`color: '${dark}'`);
  });
});
