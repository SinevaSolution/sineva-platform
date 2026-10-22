#!/usr/bin/env node
// Post-build bundle report (FR-UX-43). Records the size of every client chunk
// in `.next/static/chunks`, names the chunks that load on every page, and
// fails when a heavy library ends up in them. Usage:
//
//   node scripts/bundle_report.mjs [path-to-.next]
//
// Why fingerprints and not module names: a webpack production build minifies
// away module paths, and `@next/bundle-analyzer` would add a dependency to read
// the same chunks. Each heavy library keeps a few strings that minification
// cannot rename (CSS class names, internal property keys, ids), so the report
// searches for those. A fingerprint can miss a library; the static guard in
// `architecture.test.ts` (no static import outside `*.lazy.*` modules) is the
// first line of defence and this report is the check on what was really built.
//
// "Shared" is what every page downloads: the root main files and polyfills from
// `build-manifest.json`, plus the root layout entry. Anything else is a page or
// a lazy chunk and may legitimately hold a heavy library.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const HEAVY_LIBRARIES = [
  { name: 'three', fingerprint: /WebGLRenderer|THREE\.REVISION/ },
  { name: 'gsap', fingerprint: /GreenSock|\b_gsap\b/ },
  { name: 'recharts', fingerprint: /recharts-wrapper|recharts-surface|recharts-legend/ },
  { name: 'tiptap', fingerprint: /ProseMirror|tiptap/ },
  { name: 'dnd-kit', fingerprint: /DndLiveRegion|DndDescribedBy|dnd-kit/ },
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * @param {string} nextDir path to a `.next` directory after `next build`
 */
export function analyzeBundle(nextDir) {
  const manifestPath = join(nextDir, 'build-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`build-manifest.json not found in ${nextDir}. Run \`next build\` first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const chunkDir = join(nextDir, 'static', 'chunks');

  const files = walk(chunkDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => relative(nextDir, file).split('\\').join('/'))
    .sort();

  const sharedNames = new Set([
    ...(manifest.polyfillFiles ?? []),
    ...(manifest.rootMainFiles ?? []),
    // The root layout entry loads on every route.
    ...files.filter((file) => /^static\/chunks\/app\/layout-[^/]+\.js$/.test(file)),
  ]);

  const chunks = files.map((file) => {
    const content = readFileSync(join(nextDir, file));
    const text = content.toString('utf8');
    return {
      file,
      bytes: content.length,
      gzip_bytes: gzipSync(content).length,
      shared: sharedNames.has(file),
      heavy: HEAVY_LIBRARIES.filter((lib) => lib.fingerprint.test(text)).map((lib) => lib.name),
    };
  });

  const shared = chunks.filter((chunk) => chunk.shared);
  const heavyInShared = shared.flatMap((chunk) => chunk.heavy.map((library) => ({ library, file: chunk.file })));

  return {
    generated_at: new Date().toISOString(),
    ok: heavyInShared.length === 0,
    totals: {
      chunks: chunks.length,
      bytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
      gzip_bytes: chunks.reduce((sum, c) => sum + c.gzip_bytes, 0),
    },
    shared: {
      files: shared.map(({ file, bytes, gzip_bytes }) => ({ file, bytes, gzip_bytes })),
      bytes: shared.reduce((sum, c) => sum + c.bytes, 0),
      gzip_bytes: shared.reduce((sum, c) => sum + c.gzip_bytes, 0),
    },
    chunks,
    heavy_in_shared: heavyInShared,
  };
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main() {
  const nextDir = resolve(process.argv[2] ?? '.next');
  const report = analyzeBundle(nextDir);
  writeFileSync(join(nextDir, 'bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Client chunks: ${report.totals.chunks}, ${kb(report.totals.bytes)} raw, ${kb(report.totals.gzip_bytes)} gzip`);
  console.log(`Shared (every page): ${kb(report.shared.bytes)} raw, ${kb(report.shared.gzip_bytes)} gzip`);
  for (const file of report.shared.files) console.log(`  ${file.file}  ${kb(file.bytes)} (${kb(file.gzip_bytes)} gzip)`);
  const lazy = report.chunks.filter((c) => !c.shared && c.heavy.length);
  for (const chunk of lazy) console.log(`  lazy ${chunk.file} holds ${chunk.heavy.join(', ')} (ok: not shared)`);
  if (!report.ok) {
    for (const hit of report.heavy_in_shared) {
      console.error(`FAIL: ${hit.library} is in the shared client chunk ${hit.file}. Load it with a dynamic import() in a *.lazy.* module.`);
    }
    process.exit(1);
  }
  console.log('No heavy library in the shared client chunk.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
