import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postApprovals } from '@/app/internal/v1/approvals/route';
import { POST as postApiApprovals } from '@/app/api/internal/v1/approvals/route';
import { POST as postInputs } from '@/app/internal/v1/input-requests/route';
import { POST as postApiInputs } from '@/app/api/internal/v1/input-requests/route';
import { POST as postExpire } from '@/app/internal/v1/inbox/expire/route';
import { POST as postApiExpire } from '@/app/api/internal/v1/inbox/expire/route';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import * as container from '@/server/container';
import * as envModule from '@/server/infrastructure/config/env';

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'contract/fixtures', name), 'utf8'));

const KEY = 'test-secret-key-primary';

function request(path: string, body: unknown, key: string | null = KEY) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'x-internal-api-key': key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('internal Inbox routes for sineva-ai (WP-M1-40, ADR-0032)', () => {
  const createApproval = vi.fn();
  const createInput = vi.fn();
  const expire = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(container, 'getIngestRunInboxEventUseCase').mockReturnValue({
      createApproval,
      createInputRequest: createInput,
    } as never);
    vi.spyOn(container, 'getExpireInboxItemsUseCase').mockReturnValue({ execute: expire } as never);
    vi.spyOn(envModule, 'getEnvConfig').mockReturnValue({
      ai_engine_internal_api_key: KEY,
      ai_engine_internal_api_key_next: 'test-secret-key-secondary',
    } as ReturnType<typeof envModule.getEnvConfig>);
  });

  describe.each([
    { name: 'approvals', post: postApprovals, alias: postApiApprovals, path: '/internal/v1/approvals', body: () => fixture('approval_create_request.json'), use: createApproval },
    { name: 'input-requests', post: postInputs, alias: postApiInputs, path: '/internal/v1/input-requests', body: () => fixture('approval_input_create_request.json'), use: createInput },
  ])('POST /internal/v1/$name', ({ post, alias, path, body, use }) => {
    it('rejects a missing or wrong X-Internal-Api-Key with 401', async () => {
      expect((await post(request(path, body(), null))).status).toBe(401);
      expect((await post(request(path, body(), 'nope'))).status).toBe(401);
      expect(use).not.toHaveBeenCalled();
    });

    it('answers 201 for a new item and 200 for a replay, with platform ids', async () => {
      use.mockResolvedValueOnce({ inbox_item_id: 'i-1', approval_id: 'a-1', input_request_id: 'r-1', created: true });
      const created = await post(request(path, body()));
      expect(created.status).toBe(201);
      expect((await created.json()).data).toMatchObject({ inbox_item_id: 'i-1' });

      use.mockResolvedValueOnce({ inbox_item_id: 'i-1', approval_id: 'a-1', input_request_id: 'r-1', created: false });
      expect((await alias(request(path, body()))).status).toBe(200);
    });

    it('422 for a body that names a user or is off contract', async () => {
      expect((await post(request(path, { ...body(), user_id: 'usr-x' }))).status).toBe(422);
      expect((await post(request(path, { workspace_id: 'not-a-uuid' }))).status).toBe(422);
      expect((await post(request(path, undefined))).status).toBe(422);
      expect(use).not.toHaveBeenCalled();
    });

    it('passes a run of another workspace through as the same 404', async () => {
      use.mockRejectedValueOnce(new NotFoundError('Run', 'x'));
      expect((await post(request(path, body()))).status).toBe(404);
    });
  });

  describe('POST /internal/v1/inbox/expire', () => {
    it('401 without the key, 200 with the job result otherwise', async () => {
      expect((await postExpire(request('/internal/v1/inbox/expire', undefined, null))).status).toBe(401);
      expire.mockResolvedValue({ expired_approvals: 2, expired_inputs: 0, resumed: 2, resume_failed: 0, stale_claims_released: 0, reminders_due: [] });
      const res = await postApiExpire(request('/api/internal/v1/inbox/expire', undefined));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({ expired_approvals: 2 });
    });
  });
});
