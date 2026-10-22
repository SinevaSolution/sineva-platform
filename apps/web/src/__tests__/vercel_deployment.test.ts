import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateRuntime } from '../../../../scripts/check_node_runtime.mjs';

const ROOT = resolve(import.meta.dirname, '../../../..');
const WEB = resolve(ROOT, 'apps/web');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

interface VercelJson {
  framework?: string;
  installCommand?: string;
  buildCommand?: string;
  crons?: Array<{ path: string; schedule: string }>;
  functions?: Record<string, { maxDuration?: number }>;
}

const vercel = JSON.parse(read('apps/web/vercel.json')) as VercelJson;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const routeFiles = walk(resolve(WEB, 'src/app'))
  .filter((file) => file.endsWith('/route.ts'))
  .map((file) => relative(WEB, file).split('\\').join('/'));

// Vercel globs: `*` is one path segment. Brackets in `[workspace_id]` are
// literal in file names but a character class in a glob, so the config must
// use `*` there.
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

describe('Vercel project configuration (ADR-0047)', () => {
  it('lives in apps/web, the Root Directory, and uses the Next.js preset', () => {
    expect(vercel.framework).toBe('nextjs');
    expect(existsSync(resolve(ROOT, 'vercel.json'))).toBe(false);
  });

  it('installs from the repository root so npm workspaces and @sineva/* resolve', () => {
    expect(vercel.installCommand).toBe('cd ../.. && npm ci');
  });

  it('builds through the guarded script, which ends in the web build (prisma generate, next build)', () => {
    expect(vercel.buildCommand).toBe('node scripts/vercel_build.mjs');
    const build = JSON.parse(read('apps/web/package.json')).scripts.build as string;
    expect(build).toBe('npm run db:generate && next build');
    expect(read('apps/web/scripts/vercel_build.mjs')).toContain("['run', 'build']");
  });

  it('only the guarded Vercel script migrates: install, the web build script and Docker never do', () => {
    const forbidden = /migrate|db push|db:push|reset|seed/i;
    const commands = [
      vercel.installCommand ?? '',
      JSON.parse(read('apps/web/package.json')).scripts.build,
      JSON.parse(read('apps/web/package.json')).scripts['db:generate'],
      JSON.parse(read('package.json')).scripts.preinstall,
    ];
    for (const command of commands) expect(command).not.toMatch(forbidden);
  });

  it('pins the Node major for Vercel to the major in .nvmrc', () => {
    const nvmrcMajor = read('.nvmrc').trim().split('.')[0];
    const engines = JSON.parse(read('apps/web/package.json')).engines as { node: string };
    expect(engines.node).toBe(`${nvmrcMajor}.x`);
  });

  describe('crons', () => {
    it('has the Inbox expiry job every minute', () => {
      expect(vercel.crons).toContainEqual({
        path: '/api/internal/v1/inbox/expire',
        schedule: '* * * * *',
      });
    });

    it('has the Connections job tick every minute', () => {
      expect(vercel.crons).toContainEqual({
        path: '/api/internal/v1/jobs/tick',
        schedule: '* * * * *',
      });
    });

    it('every cron path is a route that exports GET (Vercel Cron only issues GET)', () => {
      for (const { path } of vercel.crons ?? []) {
        const file = `src/app${path}/route.ts`;
        expect(routeFiles, `${path} has no route file`).toContain(file);
        const source = read(`apps/web/${file}`) + read(`apps/web/${reexportTarget(file)}`);
        expect(source, `${path} must export GET`).toMatch(/\bGET\b/);
      }
    });

    it('cron paths sit under /api so the page guard in the proxy never redirects them', () => {
      for (const { path } of vercel.crons ?? []) expect(path.startsWith('/api/')).toBe(true);
    });

    it('no cron path carries a secret in its query string', () => {
      for (const { path } of vercel.crons ?? []) expect(path).not.toContain('?');
    });
  });

  describe('functions', () => {
    const entries = Object.entries(vercel.functions ?? {});

    it('gives the run event stream the longest duration the Hobby plan allows (300 s)', () => {
      expect(vercel.functions?.['src/app/api/v1/workspaces/*/runs/*/events/route.ts']?.maxDuration).toBe(300);
    });

    it('every pattern matches at least one route file and stays within 300 s', () => {
      expect(entries.length).toBeGreaterThan(0);
      for (const [pattern, config] of entries) {
        const regexp = globToRegExp(pattern);
        expect(
          routeFiles.some((file) => regexp.test(file)),
          `${pattern} matches no route`,
        ).toBe(true);
        expect(Number.isInteger(config.maxDuration)).toBe(true);
        expect(config.maxDuration).toBeGreaterThan(0);
        expect(config.maxDuration).toBeLessThanOrEqual(300);
      }
    });

    it('patterns avoid bracket segments, which Vercel reads as a glob character class', () => {
      for (const [pattern] of entries) expect(pattern).not.toMatch(/[[\]]/);
    });
  });
});

describe('deployment docs stay in step with the configuration', () => {
  const envSource = read('apps/web/src/server/infrastructure/config/env.ts');
  const names = [
    ...new Set([...envSource.matchAll(/raw\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]!)),
    ...[...envSource.matchAll(/optional\(raw, '([A-Z][A-Z0-9_]+)'\)/g)].map((match) => match[1]!),
    'DIRECT_DATABASE_URL',
    'PREVIEW_DATABASE_URL',
  ];
  const vercelDoc = read('docs/deployment/vercel.md');
  const envDoc = read('docs/deployment/environment_variables.md');

  it('finds the variables the config reads', () => {
    expect(names.length).toBeGreaterThan(30);
    expect(names).toContain('CRON_SECRET');
    expect(names).toContain('VAULT_LOCAL_KEK');
  });

  it('every variable is in the Vercel guide and in the environment variable reference', () => {
    // NODE_ENV is set by Next, not by the operator.
    const operatorNames = names.filter((name) => name !== 'NODE_ENV');
    expect(operatorNames.filter((name) => !vercelDoc.includes(name))).toEqual([]);
    expect(operatorNames.filter((name) => !envDoc.includes(name))).toEqual([]);
  });

  it('the guide, the ADR and the other indexes link to each other', () => {
    expect(read('docs/README.md')).toContain('deployment/vercel.md');
    expect(read('docs/deployment/README.md')).toContain('vercel.md');
    expect(read('AGENTS.md')).toContain('docs/deployment/vercel.md');
    expect(read('docs/decisions/README.md')).toContain('0047-hosting-on-vercel.md');
    expect(vercelDoc).toContain('0047-hosting-on-vercel.md');
  });

  it('the guide names every cron path of vercel.json', () => {
    for (const { path } of vercel.crons ?? []) expect(vercelDoc).toContain(path);
  });

  it('the destructive-change marker file name in the docs matches the script', () => {
    const lib = read('apps/web/scripts/vercel_build_lib.mjs');
    const marker = /APPROVAL_MARKER = '([^']+)'/.exec(lib)?.[1];
    expect(marker).toBe('APPROVED_DESTRUCTIVE.md');
    expect(vercelDoc).toContain(marker);
    expect(read('docs/engineering/database_migrations_workflow.md')).toContain(marker);
  });
});

function reexportTarget(file: string): string {
  const source = readFileSync(resolve(WEB, file), 'utf8');
  const match = /from '@\/([^']+)'/.exec(source);
  return match ? `src/${match[1]}.ts` : file;
}

describe('Node runtime guard on a platform-managed runtime (CVE-2026-111497, ADR-0047)', () => {
  const minimum = '24.22.1';

  it('stays strict outside Vercel: an older patch fails', () => {
    expect(evaluateRuntime({ minimum, actual: '24.22.0', onVercel: false }).ok).toBe(false);
    expect(evaluateRuntime({ minimum, actual: '24.9.0', onVercel: false }).ok).toBe(false);
    expect(evaluateRuntime({ minimum, actual: '22.22.1', onVercel: false }).ok).toBe(false);
    expect(evaluateRuntime({ minimum, actual: '24.22.1', onVercel: false }).ok).toBe(true);
    expect(evaluateRuntime({ minimum, actual: '24.23.0', onVercel: false }).ok).toBe(true);
  });

  it('on Vercel the major is still enforced', () => {
    expect(evaluateRuntime({ minimum, actual: '22.22.1', onVercel: true }).ok).toBe(false);
    expect(evaluateRuntime({ minimum, actual: '26.0.0', onVercel: true }).ok).toBe(false);
  });

  it('on Vercel an older patch of the same major only warns, because Vercel owns the patch level', () => {
    const result = evaluateRuntime({ minimum, actual: '24.20.0', onVercel: true });
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/Vercel/);
    expect(evaluateRuntime({ minimum, actual: '24.22.1', onVercel: true }).warning).toBeUndefined();
  });
});
