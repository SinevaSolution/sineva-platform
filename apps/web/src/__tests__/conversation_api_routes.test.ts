import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET as getConversations,
  POST as postConversation,
} from '@/app/api/v1/workspaces/[workspace_id]/conversations/route';
import { GET as getConversationDetail } from '@/app/api/v1/workspaces/[workspace_id]/conversations/[conversation_id]/route';
import {
  GET as getMessages,
  POST as postMessage,
} from '@/app/api/v1/workspaces/[workspace_id]/conversations/[conversation_id]/messages/route';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';

const mockCreateConversation = vi.fn();
const mockGetConversation = vi.fn();
const mockListConversations = vi.fn();
const mockListMessages = vi.fn();
const mockCreateMessage = vi.fn();

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getCreateConversationUseCase: () => ({ execute: mockCreateConversation }),
    getGetConversationUseCase: () => ({ execute: mockGetConversation }),
    getListConversationsUseCase: () => ({ execute: mockListConversations }),
    getListMessagesUseCase: () => ({ execute: mockListMessages }),
    getCreateMessageUseCase: () => ({ execute: mockCreateMessage }),
  };
});

installHeaderSessionResolver();

describe('Conversation & Message API Routes (WP-M0-29, FR-HUB-20, FR-HUB-32, D-M0-3)', () => {
  const workspaceIdA = '11111111-1111-4111-8111-111111111111';
  const workspaceIdB = '22222222-2222-4222-8222-222222222222';
  const conversationId1 = '33333333-3333-4333-8333-333333333333';
  const userIdA = 'usr-alpha';
  const userIdB = 'usr-bravo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/workspaces/[workspace_id]/conversations', () => {
    it('returns 201 on creating a hub conversation', async () => {
      mockCreateConversation.mockResolvedValue({
        id: conversationId1,
        workspace_id: workspaceIdA,
        user_id: userIdA,
        kind: 'hub',
        agent_slug: null,
        title: 'New Hub Conversation',
      });

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            kind: 'hub',
            title: 'New Hub Conversation',
          }),
        },
      );

      const res = await postConversation(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(conversationId1);
      expect(mockCreateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'hub',
          title: 'New Hub Conversation',
        }),
        expect.objectContaining({
          user_id: userIdA,
          workspace_id: workspaceIdA,
        }),
      );
    });

    it('returns 201 on creating a room conversation with pinned specialist', async () => {
      mockCreateConversation.mockResolvedValue({
        id: conversationId1,
        workspace_id: workspaceIdA,
        user_id: userIdA,
        kind: 'room',
        agent_slug: 'sinofinance',
        title: 'SinoFinance 1:1',
      });

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            kind: 'room',
            agent_slug: 'sinofinance',
            title: 'SinoFinance 1:1',
          }),
        },
      );

      const res = await postConversation(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.agent_slug).toBe('sinofinance');
    });

    it('returns 422 if room conversation is missing agent_slug', async () => {
      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            kind: 'room',
          }),
        },
      );

      const res = await postConversation(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(mockCreateConversation).not.toHaveBeenCalled();
    });

    it('returns 403 Forbidden when viewer attempts to create conversation', async () => {
      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'viewer',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            kind: 'hub',
          }),
        },
      );

      const res = await postConversation(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 Not Found when user does not belong to workspace', async () => {
      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdB}/conversations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA, // Not workspaceIdB
          },
          body: JSON.stringify({
            kind: 'hub',
          }),
        },
      );

      const res = await postConversation(req, {
        params: Promise.resolve({ workspace_id: workspaceIdB }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/workspaces/[workspace_id]/conversations', () => {
    it('returns 200 with list of user conversations (viewer allowed)', async () => {
      mockListConversations.mockResolvedValue({
        items: [
          {
            id: conversationId1,
            workspace_id: workspaceIdA,
            user_id: userIdA,
            kind: 'hub',
            title: 'My Chat',
          },
        ],
        next_cursor: null,
      });

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations?limit=10`,
        {
          headers: {
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'viewer',
            'x-test-session-workspaces': workspaceIdA,
          },
        },
      );

      const res = await getConversations(req, {
        params: Promise.resolve({ workspace_id: workspaceIdA }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.items).toHaveLength(1);
    });
  });

  describe('GET /api/v1/workspaces/[workspace_id]/conversations/[conversation_id]', () => {
    it('returns 200 for conversation creator', async () => {
      mockGetConversation.mockResolvedValue({
        id: conversationId1,
        workspace_id: workspaceIdA,
        user_id: userIdA,
        kind: 'hub',
        title: 'Secret Project',
      });

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}`,
        {
          headers: {
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
        },
      );

      const res = await getConversationDetail(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.id).toBe(conversationId1);
    });

    it('returns 404 (NotFoundError) for another member in the same workspace (FR-HUB-32)', async () => {
      mockGetConversation.mockRejectedValue(
        new NotFoundError('Conversation', conversationId1),
      );

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}`,
        {
          headers: {
            'x-test-session-user-id': userIdB,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
        },
      );

      const res = await getConversationDetail(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });

  describe('POST /api/v1/workspaces/[workspace_id]/conversations/[conversation_id]/messages', () => {
    it('returns 201 on valid message and returns message_id and run_id (D-M0-3)', async () => {
      mockCreateMessage.mockResolvedValue({
        message_id: 'msg-101',
        run_id: 'run_abc123',
        conversation_id: conversationId1,
        status: 'completed',
      });

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            content: '@SinoFinance calculate runway',
            client_message_id: 'cli-key-1',
          }),
        },
      );

      const res = await postMessage(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.message_id).toBe('msg-101');
      expect(json.data.run_id).toBe('run_abc123');
      expect(mockCreateMessage).toHaveBeenCalledWith(
        conversationId1,
        expect.objectContaining({
          content: '@SinoFinance calculate runway',
          client_message_id: 'cli-key-1',
        }),
        expect.objectContaining({
          user_id: userIdA,
          workspace_id: workspaceIdA,
        }),
      );
    });

    it('returns 403 Forbidden when viewer attempts to send message (OQ-HUB-2)', async () => {
      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'viewer',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            content: 'Hello from viewer',
          }),
        },
      );

      const res = await postMessage(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 422 if message content exceeds 8,000 characters', async () => {
      const hugeContent = 'a'.repeat(8001);

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            content: hugeContent,
          }),
        },
      );

      const res = await postMessage(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(mockCreateMessage).not.toHaveBeenCalled();
    });

    it('returns 422 if room conversation rejects message for another specialist', async () => {
      mockCreateMessage.mockRejectedValue(
        new ValidationError(
          "Room is dedicated to specialist 'sinofinance'. Cannot address 'sinosales' in this room.",
          [
            {
              field: 'content',
              code: 'room_specialist_mismatch',
              detail: "Cannot address 'sinosales' in this room.",
            },
          ],
        ),
      );

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            content: '@SinoSales help me with leads',
          }),
        },
      );

      const res = await postMessage(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
    });

    it('returns 404 (NotFoundError) when posting to another member conversation', async () => {
      mockCreateMessage.mockRejectedValue(
        new NotFoundError('Conversation', conversationId1),
      );

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-session-user-id': userIdB,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
          body: JSON.stringify({
            content: 'Attempting to inject into User A chat',
          }),
        },
      );

      const res = await postMessage(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });

  describe('GET /api/v1/workspaces/[workspace_id]/conversations/[conversation_id]/messages', () => {
    it('returns 200 with saved transcript in order for creator', async () => {
      mockListMessages.mockResolvedValue({
        items: [
          {
            id: 'm-1',
            role: 'user',
            content: 'Hello',
            created_at: '2026-10-21T10:00:00Z',
          },
          {
            id: 'm-2',
            role: 'assistant',
            content: 'Hi!',
            created_at: '2026-10-21T10:00:05Z',
          },
        ],
        next_cursor: null,
      });

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          headers: {
            'x-test-session-user-id': userIdA,
            'x-test-session-role': 'viewer', // Viewer is allowed to read!
            'x-test-session-workspaces': workspaceIdA,
          },
        },
      );

      const res = await getMessages(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.items).toHaveLength(2);
      expect(json.data.items[0].id).toBe('m-1');
      expect(json.data.items[1].id).toBe('m-2');
    });

    it('returns 404 (NotFoundError) for another member in the same workspace', async () => {
      mockListMessages.mockRejectedValue(
        new NotFoundError('Conversation', conversationId1),
      );

      const req = new NextRequest(
        `https://app.sineva.id/api/v1/workspaces/${workspaceIdA}/conversations/${conversationId1}/messages`,
        {
          headers: {
            'x-test-session-user-id': userIdB,
            'x-test-session-role': 'member',
            'x-test-session-workspaces': workspaceIdA,
          },
        },
      );

      const res = await getMessages(req, {
        params: Promise.resolve({
          workspace_id: workspaceIdA,
          conversation_id: conversationId1,
        }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });
});
