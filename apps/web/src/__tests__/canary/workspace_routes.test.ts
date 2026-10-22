import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installHeaderSessionResolver } from '../fakes/header_session_resolver';
const calls = vi.hoisted(() => vi.fn());
vi.mock('@/server/container', async (original) => {
  const actual = await original<typeof import('@/server/container')>();
  return Object.fromEntries(
    Object.keys(actual).map((key) => [
      key,
      () => {
        calls(key);
        throw new Error('A cross-tenant request reached a use case or database adapter');
      },
    ]),
  );
});
declare global {
  interface ImportMeta {
    glob<T>(pattern: string, options: { eager: true }): Record<string, T>;
  }
}
const modules = import.meta.glob<Record<string, unknown>>(
  '../../app/api/v1/workspaces/**/route.ts',
  { eager: true },
);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CANARY = 'tenant_a_private_canary_41c80f';
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const rows = Object.entries(modules)
  .filter(([path]) => path.includes('[workspace_id]'))
  .flatMap(([file, module]) =>
    methods
      .filter((method) => typeof module[method] === 'function')
      .map((method) => ({
        file,
        method,
        handler: module[method] as (
          request: NextRequest,
          context: { params: Promise<Record<string, string>> },
        ) => Promise<Response>,
      })),
  );
function assertIsolated(status: number, responseText: string, accesses: number) {
  expect(status).toBe(404);
  expect(responseText).not.toContain(CANARY);
  expect(accesses).toBe(0);
}
beforeEach(() => {
  calls.mockClear();
  installHeaderSessionResolver();
});
describe('cross-tenant route canary (WP-M0-35, platform lane)', () => {
  it('discovers the entire workspace-scoped API inventory', () => {
    expect(rows.length).toBeGreaterThan(60);
  });
  it.each(rows)(
    '$method $file rejects tenant B before touching tenant A',
    async ({ file, method, handler }) => {
      const params: Record<string, string> = {};
      const path = file
        .replace('../../app', '')
        .replace('/route.ts', '')
        .replace(/\[([^\]]+)\]/g, (_, key: string) => {
          const value =
            key === 'workspace_id'
              ? A
              : key === 'agent_slug'
                ? 'sinohelp'
                : key === 'version'
                  ? '1'
                  : '33333333-3333-4333-8333-333333333333';
          params[key] = value;
          return value;
        });
      const request = new NextRequest(`http://localhost:3001${path}`, {
        method,
        headers: {
          'x-test-session-user-id': 'user-b',
          'x-test-session-role': 'owner',
          'x-test-session-workspaces': B,
          'x-sineva-action': '1',
          'content-type': 'application/json',
        },
        ...(method !== 'GET'
          ? { body: JSON.stringify({ workspace_id: A, user_id: 'user-a', content: CANARY }) }
          : {}),
      });
      const response = await handler(request, { params: Promise.resolve(params) });
      assertIsolated(response.status, await response.text(), calls.mock.calls.length);
    },
  );
  it('the assertion detects a deliberately removed tenant gate', () => {
    expect(() => assertIsolated(200, JSON.stringify({ content: CANARY }), 1)).toThrow();
    expect(() => assertIsolated(404, JSON.stringify({ error: CANARY }), 0)).toThrow();
    expect(() => assertIsolated(404, '{}', 1)).toThrow();
  });
});
