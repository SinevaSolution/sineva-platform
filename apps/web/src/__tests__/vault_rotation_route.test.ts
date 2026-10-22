import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postRotate } from '@/app/internal/v1/vault/rotate-keys/route';
import { POST as postApiRotate } from '@/app/api/internal/v1/vault/rotate-keys/route';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';

const KEY = 'test-secret-key-primary';

describe('POST /internal/v1/vault/rotate-keys (runbook: KEK rotation)', () => {
  const rotate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rotate.mockResolvedValue({ rotated: 3, skipped: 0, failed: 0, more: false });
    vi.spyOn(container, 'getVaultKeyRotation').mockReturnValue({ rotate } as never);
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({ ai_engine_internal_api_key: KEY } as ReturnType<typeof envModule.getEnvConfig>);
  });

  const request = (path: string, body?: unknown, key: string | null = KEY) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: { ...(key ? { 'x-internal-api-key': key } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  it.each([
    ['/internal/v1/vault/rotate-keys', postRotate],
    ['/api/internal/v1/vault/rotate-keys', postApiRotate],
  ])('%s', async (path, handler) => {
    expect((await handler(request(path, {}, null))).status).toBe(401);
    expect(rotate).not.toHaveBeenCalled();

    const ok = await handler(request(path));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ rotated: 3, skipped: 0, failed: 0, more: false });
    expect(rotate).toHaveBeenLastCalledWith(100);

    await handler(request(path, { limit: 500 }));
    expect(rotate).toHaveBeenLastCalledWith(500);
    expect((await handler(request(path, { limit: 0 }))).status).toBe(422);
    expect((await handler(request(path, { limit: 501 }))).status).toBe(422);
    expect((await handler(request(path, { workspace_id: 'x' }))).status).toBe(422);
  });
});
