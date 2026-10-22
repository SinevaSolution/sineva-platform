import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeBundle, HEAVY_LIBRARIES } from '../../scripts/bundle_report.mjs';

// FR-UX-43: record chunk sizes after a build and fail when a heavy library
// ends up in the chunk every page loads. The check works on a fake `.next`
// directory, so it needs no build.
interface Report {
  ok: boolean;
  shared: { files: Array<{ file: string; bytes: number; gzip_bytes: number }>; bytes: number; gzip_bytes: number };
  chunks: Array<{ file: string; shared: boolean; heavy: string[] }>;
  heavy_in_shared: Array<{ library: string; file: string }>;
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fakeNextDir(chunks: Record<string, string>, manifest?: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-report-'));
  dirs.push(dir);
  for (const [file, content] of Object.entries(chunks)) {
    const full = join(dir, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  writeFileSync(
    join(dir, 'build-manifest.json'),
    JSON.stringify(
      manifest ?? {
        polyfillFiles: ['static/chunks/polyfills.js'],
        rootMainFiles: ['static/chunks/webpack.js', 'static/chunks/main-app.js'],
      },
    ),
  );
  return dir;
}

const BASE = {
  'static/chunks/polyfills.js': 'a'.repeat(2000),
  'static/chunks/webpack.js': 'b'.repeat(1000),
  'static/chunks/main-app.js': 'c'.repeat(3000),
  'static/chunks/app/layout-1.js': 'd'.repeat(500),
  'static/chunks/app/page-1.js': 'e'.repeat(700),
};

describe('bundle report (FR-UX-43)', () => {
  it('lists the heavy libraries the plan names', () => {
    expect(HEAVY_LIBRARIES.map((l: { name: string }) => l.name).sort()).toEqual(
      ['dnd-kit', 'gsap', 'recharts', 'three', 'tiptap'],
    );
  });

  it('records raw and gzip sizes per chunk and for the shared set', () => {
    const report = analyzeBundle(fakeNextDir(BASE)) as unknown as Report;
    const main = report.shared.files.find((f) => f.file === 'static/chunks/main-app.js')!;
    expect(main.bytes).toBe(3000);
    expect(main.gzip_bytes).toBeGreaterThan(0);
    expect(main.gzip_bytes).toBeLessThan(main.bytes);
    expect(report.chunks.map((c) => c.file)).toContain('static/chunks/app/page-1.js');
  });

  it('treats root main files, polyfills and the root layout entry as shared', () => {
    const report = analyzeBundle(fakeNextDir(BASE)) as unknown as Report;
    const shared = report.shared.files.map((f) => f.file).sort();
    expect(shared).toEqual([
      'static/chunks/app/layout-1.js',
      'static/chunks/main-app.js',
      'static/chunks/polyfills.js',
      'static/chunks/webpack.js',
    ]);
    expect(report.chunks.find((c) => c.file === 'static/chunks/app/page-1.js')!.shared).toBe(false);
  });

  it('passes when a heavy library sits only in a lazy page chunk', () => {
    const report = analyzeBundle(
      fakeNextDir({ ...BASE, 'static/chunks/9999-lazy.js': 'x.registerPlugin; GreenSock gsap core' }),
    ) as unknown as Report;
    expect(report.ok).toBe(true);
    expect(report.heavy_in_shared).toEqual([]);
    expect(report.chunks.find((c) => c.file === 'static/chunks/9999-lazy.js')!.heavy).toContain('gsap');
  });

  it.each([
    ['gsap', 'var t=e._gsap;GreenSock'],
    ['three', 'new WebGLRenderer({antialias:!0})'],
    ['recharts', 'className:"recharts-wrapper"'],
    ['tiptap', 'ProseMirror-trailingBreak'],
    ['dnd-kit', 'id:"DndLiveRegion-1"'],
  ])('fails when %s is in the shared client chunk', (library, snippet) => {
    const report = analyzeBundle(
      fakeNextDir({ ...BASE, 'static/chunks/main-app.js': `${'c'.repeat(100)}${snippet}` }),
    ) as unknown as Report;
    expect(report.ok).toBe(false);
    expect(report.heavy_in_shared).toEqual([{ library, file: 'static/chunks/main-app.js' }]);
  });

  it('fails clearly when the build manifest is missing', () => {
    const dir = fakeNextDir(BASE);
    rmSync(join(dir, 'build-manifest.json'));
    expect(() => analyzeBundle(dir)).toThrow(/build-manifest\.json/);
  });
});
