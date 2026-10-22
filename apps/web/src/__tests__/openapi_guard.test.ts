import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';

const APP_DIR = resolve(import.meta.dirname, '../app');
const ROOT_PKG = resolve(import.meta.dirname, '../../../../package.json');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function walk(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

export function parseExportedMethods(content: string): HttpMethod[] {
  const clean = stripComments(content);
  const methods = new Set<HttpMethod>();

  for (const method of HTTP_METHODS) {
    const fnRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    const constRegex = new RegExp(`export\\s+(?:const|let|var)\\s+${method}\\b`);
    const namedExportRegex = new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`);

    if (fnRegex.test(clean) || constRegex.test(clean) || namedExportRegex.test(clean)) {
      methods.add(method);
    }
  }

  return Array.from(methods);
}

export function filePathToOpenApiPath(filePath: string): string {
  const rel = relative(APP_DIR, filePath).split('\\').join('/');
  // Remove /route.ts or /route.js
  const withoutRoute = rel.replace(/\/route\.(ts|js|tsx|jsx)$/, '');
  // Convert [param] to {param}
  const openApiPath = '/' + withoutRoute.replace(/\[([^\]]+)\]/g, '{$1}');
  return openApiPath;
}

export function findMissingSpecEntries(
  routes: Array<{ path: string; method: string }>,
  specPaths: Record<string, Record<string, unknown>>,
): string[] {
  const missing: string[] = [];

  for (const { path, method } of routes) {
    // Exclude the schema route itself
    if (path === '/api/openapi.json') {
      continue;
    }
    const pathItem = specPaths[path];
    if (!pathItem) {
      missing.push(`${method.toUpperCase()} ${path} -> path '${path}' not in OpenAPI spec`);
    } else if (!pathItem[method.toLowerCase()]) {
      missing.push(
        `${method.toUpperCase()} ${path} -> method '${method.toLowerCase()}' not in OpenAPI spec for '${path}'`,
      );
    }
  }

  return missing;
}

describe('Repository Guards & CI Safety (WP-M0-06)', () => {
  it('docker:down in root package.json must not pass -v to prevent destroying shared volumes (OPS-2)', () => {
    const pkgContent = JSON.parse(readFileSync(ROOT_PKG, 'utf8'));
    const dockerDown = pkgContent.scripts?.['docker:down'] || '';
    expect(dockerDown).not.toContain('-v');
    expect(dockerDown).toContain('docker compose down');
  });

  it('docker:reset in root package.json requires explicit confirmation (OPS-2)', () => {
    const pkgContent = JSON.parse(readFileSync(ROOT_PKG, 'utf8'));
    const dockerReset = pkgContent.scripts?.['docker:reset'];
    expect(dockerReset).toBeDefined();
    expect(dockerReset).toContain('CONFIRM_RESET');
  });

  it('findMissingSpecEntries correctly detects an unmapped route or method', () => {
    const spec = getOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };
    const missing = findMissingSpecEntries(
      [
        { path: '/api/v1/dummy_unregistered_route', method: 'GET' },
        { path: '/api/v1/health', method: 'DELETE' },
      ],
      spec.paths,
    );

    expect(missing).toHaveLength(2);
    expect(missing[0]).toContain("path '/api/v1/dummy_unregistered_route' not in OpenAPI spec");
    expect(missing[1]).toContain("method 'delete' not in OpenAPI spec");
  });

  it('every App Router API route has an entry in OpenAPI spec (API-2, R-25)', () => {
    const apiFiles = walk(join(APP_DIR, 'api')).filter((f) => /\/route\.(ts|js)$/.test(f));
    const routes: Array<{ path: string; method: string }> = [];

    for (const file of apiFiles) {
      const content = readFileSync(file, 'utf8');
      const openApiPath = filePathToOpenApiPath(file);
      const methods = parseExportedMethods(content);

      for (const method of methods) {
        routes.push({ path: openApiPath, method });
      }
    }

    expect(routes.length).toBeGreaterThan(0);

    const spec = getOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };
    const missing = findMissingSpecEntries(routes, spec.paths);

    expect(
      missing,
      `Found API routes missing from OpenAPI spec:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
