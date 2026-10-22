import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MUTATING_ROUTE_POLICY,
  findPolicyViolations,
  type MutatingRoutePolicy,
} from '@/server/http/route_policy';

const SRC_ROOT = resolve(import.meta.dirname, '..');
const APP_DIR = join(SRC_ROOT, 'app');
const SERVER_DIR = join(SRC_ROOT, 'server');
const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function exportedMethods(content: string): string[] {
  const clean = stripComments(content);
  return ['GET', ...MUTATING_METHODS].filter((method) =>
    new RegExp(
      `export\\s+(?:async\\s+function|const|let|var)\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`,
    ).test(clean),
  );
}

// `app/api/v1/workspaces/[workspace_id]/route.ts` -> `/api/v1/workspaces/{workspace_id}`.
// `app/internal/...` is served under `/internal`, and `app/api/internal/...`
// re-exports it, so both map to their own path.
function routePath(file: string): string {
  const rel = relative(APP_DIR, file).split('\\').join('/').replace(/\/route\.ts$/, '');
  return `/${rel.replace(/\[([^\]]+)\]/g, '{$1}')}`;
}

interface DiscoveredRoute {
  key: string;
  method: string;
}

function discoverRoutes(): DiscoveredRoute[] {
  return walk(APP_DIR)
    .filter((file) => file.endsWith('/route.ts'))
    .flatMap((file) => {
      const path = routePath(file);
      const methods = exportedMethods(readFileSync(file, 'utf8'));
      return methods.map((method) => ({ key: `${method} ${path}`, method }));
    });
}

describe('route inventory: every mutating route has an audit mapping (FR-SEC-33)', () => {
  const routes = discoverRoutes();
  const mutating = routes.filter((route) => MUTATING_METHODS.includes(route.method));

  it('finds the mutating routes', () => {
    expect(mutating.length).toBeGreaterThan(10);
  });

  it('fails for any mutating route with no policy entry', () => {
    const unmapped = mutating.filter((route) => !(route.key in MUTATING_ROUTE_POLICY)).map((r) => r.key);
    expect(unmapped, `add these to MUTATING_ROUTE_POLICY with an audit event or an explicit none: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('has no entry for a route that no longer exists', () => {
    const known = new Set(routes.map((route) => route.key));
    const stale = Object.keys(MUTATING_ROUTE_POLICY).filter((key) => !known.has(key));
    expect(stale).toEqual([]);
  });

  it('requires a written reason for every audit: none', () => {
    for (const [key, policy] of Object.entries(MUTATING_ROUTE_POLICY)) {
      if (policy.audit === 'none') {
        expect('reason' in policy && policy.reason.trim().length >= 20, `${key} needs a reason`).toBe(true);
      } else {
        expect(policy.audit.length, `${key} lists no events`).toBeGreaterThan(0);
      }
    }
  });

  it('lists only events the server code actually emits', () => {
    const source = walk(SERVER_DIR)
      .filter((file) => /\.ts$/.test(file) && !file.endsWith('route_policy.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const missing: string[] = [];
    for (const [key, policy] of Object.entries(MUTATING_ROUTE_POLICY)) {
      if (policy.audit === 'none') continue;
      for (const action of policy.audit) {
        if (!source.includes(`'${action}'`)) missing.push(`${key} -> ${action}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('route inventory: checker mutation checks', () => {
  it('reports an audit none without a reason', () => {
    const broken = {
      'POST /api/v1/widgets': { effect: 'change', audit: 'none', reason: 'short' },
    } as Record<string, MutatingRoutePolicy>;
    expect(findPolicyViolations(broken).length).toBeGreaterThan(0);
  });

  it('reports an entry that lists no events', () => {
    const broken = {
      'POST /api/v1/widgets': { effect: 'change', audit: [] },
    } as Record<string, MutatingRoutePolicy>;
    expect(findPolicyViolations(broken).length).toBeGreaterThan(0);
  });
});
