import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(import.meta.dirname, '..');

interface SourceFile {
  /** Path relative to src, posix style (e.g. `server/container.ts`). */
  rel: string;
  content: string;
  /** Every import specifier, with relative ones normalised to `@/...` form. */
  imports: string[];
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Comments are stripped before parsing so that prose such as
// "imported from '@/server/...'" in a comment can't trip the guard.
// Only full-line `//` comments are removed: a blanket `//` strip would
// truncate string literals like 'http://localhost'.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// Regex over a full parser: no new deps, and the codebase only uses static
// `import ... from`, side-effect `import '...'`, `export ... from` and
// dynamic `import('...')`, all of which this covers.
const IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function parseImports(file: string, content: string): string[] {
  const specifiers: string[] = [];
  for (const match of stripComments(content).matchAll(IMPORT_PATTERN)) {
    const specifier = match[1]!;
    if (specifier.startsWith('.')) {
      // Normalise so `../../server/x` can't dodge a layer rule that is
      // written against the `@/` alias.
      const absolute = resolve(dirname(file), specifier);
      specifiers.push(`@/${relative(SRC_ROOT, absolute).split('\\').join('/')}`);
    } else {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function collect(subdir: string): SourceFile[] {
  return walk(join(SRC_ROOT, subdir))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => {
      const content = readFileSync(file, 'utf8');
      return {
        rel: relative(SRC_ROOT, file).split('\\').join('/'),
        content,
        imports: parseImports(file, content),
      };
    });
}

function matches(specifier: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return specifier === pattern || specifier.startsWith(`${pattern}/`);
  }
  return pattern.test(specifier);
}

function violations(
  files: SourceFile[],
  forbidden: Array<string | RegExp>,
  allowed: Array<string | RegExp> = [],
): string[] {
  return files.flatMap((file) =>
    file.imports
      .filter(
        (specifier) =>
          forbidden.some((pattern) => matches(specifier, pattern)) &&
          !allowed.some((pattern) => matches(specifier, pattern)),
      )
      .map((specifier) => `${file.rel} -> ${specifier}`),
  );
}

// Packages that tie code to a concrete persistence/cache/storage technology.
// The domain layer must stay free of these so adapters remain swappable.
const ORM_AND_DRIVER_PACKAGES: Array<string | RegExp> = [
  'drizzle-orm',
  'drizzle-kit',
  'pg',
  'ioredis',
  'redis',
  'prisma',
  /^@prisma\//,
  /^@aws-sdk\//,
];

describe('Architecture: backend/frontend split', () => {
  it('has the layered directory layout and no legacy top-level layers', () => {
    for (const dir of [
      'server/domain',
      'server/application',
      'server/infrastructure',
      'server/http',
      'client/components',
      'client/store',
      'shared',
    ]) {
      expect(existsSync(join(SRC_ROOT, dir)), `${dir} should exist`).toBe(true);
    }
    expect(existsSync(join(SRC_ROOT, 'server/container.ts'))).toBe(true);

    for (const legacy of [
      'domain',
      'application',
      'infrastructure',
      'presentation',
    ]) {
      expect(
        existsSync(join(SRC_ROOT, legacy)),
        `src/${legacy} should no longer exist`,
      ).toBe(false);
    }
  });

  it('client code never imports server code or server-only', () => {
    const client = collect('client');
    expect(client.length).toBeGreaterThan(0);
    expect(violations(client, ['@/server', 'server-only'])).toEqual([]);
  });

  it('domain layer is framework- and ORM-free and depends on nothing outward', () => {
    const domain = collect('server/domain');
    expect(domain.length).toBeGreaterThan(0);
    expect(
      violations(domain, [
        '@/server/application',
        '@/server/infrastructure',
        '@/server/http',
        'next',
        'react',
        'react-dom',
        ...ORM_AND_DRIVER_PACKAGES,
      ]),
    ).toEqual([]);
  });

  it('application layer does not depend on infrastructure, http, next or react', () => {
    const application = collect('server/application');
    expect(application.length).toBeGreaterThan(0);
    expect(
      violations(application, [
        '@/server/infrastructure',
        '@/server/http',
        'next',
        'react',
        'react-dom',
      ]),
    ).toEqual([]);
  });

  it('infrastructure layer does not depend on application or http', () => {
    const infrastructure = collect('server/infrastructure');
    expect(infrastructure.length).toBeGreaterThan(0);
    expect(
      violations(infrastructure, ['@/server/application', '@/server/http']),
    ).toEqual([]);
  });

  it("marks every infrastructure file and the container with import 'server-only'", () => {
    const guarded = [
      // The Prisma client under `database/generated` is emitted by
      // `prisma generate`; its files cannot carry a hand-written guard import.
      ...collect('server/infrastructure').filter(
        (file) => !file.rel.startsWith('server/infrastructure/database/generated/'),
      ),
      ...collect('server').filter((file) => file.rel === 'server/container.ts'),
    ];
    expect(guarded.map((file) => file.rel)).toContain('server/container.ts');

    const missing = guarded
      .filter(
        (file) =>
          !/^import\s+['"]server-only['"];?\s*$/m.test(
            stripComments(file.content),
          ),
      )
      .map((file) => file.rel);
    expect(missing).toEqual([]);
  });

  it('routes and pages take dependencies from the container, not infrastructure', () => {
    const app = collect('app');
    expect(app.length).toBeGreaterThan(0);
    expect(
      violations(
        app,
        ['@/server/infrastructure'],
        // The OpenAPI spec is a static, dependency-free document.
        ['@/server/infrastructure/openapi'],
      ),
    ).toEqual([]);
  });
});
