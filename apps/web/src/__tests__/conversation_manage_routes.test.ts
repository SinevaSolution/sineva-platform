import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DELETE as deleteConversation,
  PATCH as patchConversation,
} from '@/app/api/v1/workspaces/[workspace_id]/conversations/[conversation_id]/route';
import { NotFoundError } from '@/server/domain/errors/domain_error';

const mockRename = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getRenameConversationUseCase: () => ({ execute: mockRename }),
    getDeleteConversationUseCase: () => ({ execute: mockDelete }),
  };
});

installHeaderSessionResolver();

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const URL_A = `https://app.sineva.id/api/v1/workspaces/${WS_A}/conversations/${CONVERSATION_ID}`;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-test-session-user-id': 'usr-alpha',
    'x-test-session-role': 'member',
    'x-test-session-workspaces': WS_A,
    ...extra,
  };
}

const params = (workspace = WS_A) =>
  ({ params: Promise.resolve({ workspace_id: workspace, conversation_id: CONVERSATION_ID }) });

function patch(body: unknown, extra: Record<string, string> = {}, url = URL_A) {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: headers(extra),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('PATCH and DELETE /api/v1/workspaces/{workspace_id}/conversations/{conversation_id}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PATCH (rename)', () => {
    it('returns 200 with the renamed conversation and passes the parsed title and context', async () => {
      mockRename.mockResolvedValue({ id: CONVERSATION_ID, title: 'Budget', title_source: 'user' });
      const res = await patchConversation(patch({ title: '  Budget  ' }), params());
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toMatchObject({ id: CONVERSATION_ID, title: 'Budget', title_source: 'user' });
      expect(mockRename).toHaveBeenCalledWith(
        CONVERSATION_ID,
        { title: 'Budget' },
        expect.objectContaining({ user_id: 'usr-alpha', workspace_id: WS_A }),
      );
    });

    it.each([
      ['an empty title', { title: '' }],
      ['a whitespace-only title', { title: '   ' }],
      ['a 121 character title', { title: 'x'.repeat(121) }],
      ['a missing title', {}],
      ['a non-string title', { title: 42 }],
    ])('returns 422 for %s and never reaches the use case', async (_label, body) => {
      const res = await patchConversation(patch(body), params());
      expect(res.status).toBe(422);
      expect(mockRename).not.toHaveBeenCalled();
    });

    it('returns 422 for an empty or invalid JSON body', async () => {
      const res = await patchConversation(patch('{not json'), params());
      expect(res.status).toBe(422);
    });

    it('returns 404 when the use case says the conversation is not the caller own', async () => {
      mockRename.mockRejectedValue(new NotFoundError('Conversation', CONVERSATION_ID));
      const res = await patchConversation(patch({ title: 'Mine now' }), params());
      expect(res.status).toBe(404);
    });

    it('returns 404 for a workspace the caller is not a member of', async () => {
      const url = `https://app.sineva.id/api/v1/workspaces/${WS_B}/conversations/${CONVERSATION_ID}`;
      const res = await patchConversation(patch({ title: 'x' }, {}, url), params(WS_B));
      expect(res.status).toBe(404);
      expect(mockRename).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
      const res = await patchConversation(
        patch({ title: 'x' }, { 'x-test-unauthenticated': 'true' }),
        params(),
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 for a viewer (read-only role)', async () => {
      const res = await patchConversation(patch({ title: 'x' }, { 'x-test-session-role': 'viewer' }), params());
      expect(res.status).toBe(403);
      expect(mockRename).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    function del(extra: Record<string, string> = {}, url = URL_A) {
      return new NextRequest(url, { method: 'DELETE', headers: headers(extra) });
    }

    it('returns 200 with the deleted id and passes the context', async () => {
      mockDelete.mockResolvedValue(undefined);
      const res = await deleteConversation(del(), params());
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: CONVERSATION_ID, deleted: true });
      expect(mockDelete).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ user_id: 'usr-alpha', workspace_id: WS_A }),
      );
    });

    it('returns 404 when the conversation is not the caller own', async () => {
      mockDelete.mockRejectedValue(new NotFoundError('Conversation', CONVERSATION_ID));
      const res = await deleteConversation(del(), params());
      expect(res.status).toBe(404);
    });

    it('returns 404 for a workspace the caller is not a member of', async () => {
      const url = `https://app.sineva.id/api/v1/workspaces/${WS_B}/conversations/${CONVERSATION_ID}`;
      const res = await deleteConversation(del({}, url), params(WS_B));
      expect(res.status).toBe(404);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
      const res = await deleteConversation(del({ 'x-test-unauthenticated': 'true' }), params());
      expect(res.status).toBe(401);
    });

    it('returns 403 for a viewer', async () => {
      const res = await deleteConversation(del({ 'x-test-session-role': 'viewer' }), params());
      expect(res.status).toBe(403);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
