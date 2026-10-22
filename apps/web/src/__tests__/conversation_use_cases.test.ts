import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { MessageEntity } from '@/server/domain/entities/message';
import { CreateConversationUseCase } from '@/server/application/use-cases/chat/create_conversation_use_case';
import { GetConversationUseCase } from '@/server/application/use-cases/chat/get_conversation_use_case';
import { ListConversationsUseCase } from '@/server/application/use-cases/chat/list_conversations_use_case';
import { ListMessagesUseCase } from '@/server/application/use-cases/chat/list_messages_use_case';
import { CreateMessageUseCase } from '@/server/application/use-cases/chat/create_message_use_case';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/server/domain/errors/domain_error';

describe('Conversation & Message Use Cases (WP-M0-29, FR-HUB-20, FR-HUB-32, D-M0-3, D-M0-8)', () => {
  const workspaceIdA = '11111111-1111-4111-8111-111111111111';
  const workspaceIdB = '22222222-2222-4222-8222-222222222222';
  const userA = 'user-alpha';
  const userB = 'user-bravo';

  const contextUserA: RequestContext = {
    user_id: userA,
    workspace_id: workspaceIdA,
    session_id: 'sess-a',
    request_id: 'req-a',
    actor: { type: 'user', id: userA },
  };

  const contextUserB: RequestContext = {
    user_id: userB,
    workspace_id: workspaceIdA,
    session_id: 'sess-b',
    request_id: 'req-b',
    actor: { type: 'user', id: userB },
  };

  const contextWorkspaceB: RequestContext = {
    user_id: userA,
    workspace_id: workspaceIdB,
    session_id: 'sess-wb',
    request_id: 'req-wb',
    actor: { type: 'user', id: userA },
  };

  let mockConversationRepo: {
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    updateLastMessageAt: ReturnType<typeof vi.fn>;
  };

  let mockMessageRepo: {
    create: ReturnType<typeof vi.fn>;
    findByClientMessageId: ReturnType<typeof vi.fn>;
    listByConversation: ReturnType<typeof vi.fn>;
  };

  let mockAuditLogger: {
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      updateLastMessageAt: vi.fn(),
    };

    mockMessageRepo = {
      create: vi.fn(),
      findByClientMessageId: vi.fn(),
      listByConversation: vi.fn(),
    };

    mockAuditLogger = {
      log: vi.fn(),
    };
  });

  describe('CreateConversationUseCase', () => {
    it('creates a hub conversation and logs audit event without message content', async () => {
      const useCase = new CreateConversationUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockAuditLogger as unknown as AuditLogger,
      );

      const fakeConversation: ConversationEntity = {
        id: 'conv-1',
        workspace_id: workspaceIdA,
        user_id: userA,
        kind: 'hub',
        agent_slug: null,
        title: 'Project Discussion',
        title_source: 'user',
        pinned_at: null,
        archived_at: null,
        origin_message_id: null,
        origin_channel: 'web',
        last_message_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockConversationRepo.create.mockResolvedValue(fakeConversation);

      const result = await useCase.execute(
        {
          kind: 'hub',
          title: 'Project Discussion',
        },
        contextUserA,
      );

      expect(result.id).toBe('conv-1');
      expect(mockConversationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: workspaceIdA,
          user_id: userA,
          kind: 'hub',
          agent_slug: null,
          title: 'Project Discussion',
        }),
      );

      // Audit event must only log ids and metadata, never message content (Task 6)
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversation.created',
          target_resource_id: 'conv-1',
          target_resource_type: 'conversation',
          metadata: {
            kind: 'hub',
            agent_slug: null,
          },
        }),
      );
    });

    it('creates a room conversation with pinned specialist agent_slug', async () => {
      const useCase = new CreateConversationUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockAuditLogger as unknown as AuditLogger,
      );

      const fakeConversation: ConversationEntity = {
        id: 'conv-2',
        workspace_id: workspaceIdA,
        user_id: userA,
        kind: 'room',
        agent_slug: 'sinofinance',
        title: 'SinoFinance 1:1',
        title_source: 'auto',
        pinned_at: null,
        archived_at: null,
        origin_message_id: null,
        origin_channel: 'web',
        last_message_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockConversationRepo.create.mockResolvedValue(fakeConversation);

      const result = await useCase.execute(
        {
          kind: 'room',
          agent_slug: 'sinofinance',
          title: 'SinoFinance 1:1',
        },
        contextUserA,
      );

      expect(result.id).toBe('conv-2');
      expect(result.agent_slug).toBe('sinofinance');
      expect(mockConversationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: workspaceIdA,
          user_id: userA,
          kind: 'room',
          agent_slug: 'sinofinance',
        }),
      );
    });
  });

  describe('GetConversationUseCase (Private Ownership, FR-HUB-32)', () => {
    const ownedConv: ConversationEntity = {
      id: 'conv-private-1',
      workspace_id: workspaceIdA,
      user_id: userA,
      kind: 'hub',
      agent_slug: null,
      title: 'Top Secret Chat',
      title_source: 'user',
      pinned_at: null,
      archived_at: null,
      origin_message_id: null,
      origin_channel: 'web',
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('returns conversation to the creator user', async () => {
      mockConversationRepo.findById.mockResolvedValue(ownedConv);
      const useCase = new GetConversationUseCase(
        mockConversationRepo as unknown as ConversationRepository,
      );

      const result = await useCase.execute('conv-private-1', contextUserA);
      expect(result.id).toBe('conv-private-1');
    });

    it('returns 404 (NotFoundError) to another member in the same workspace (FR-HUB-32)', async () => {
      mockConversationRepo.findById.mockResolvedValue(ownedConv);
      const useCase = new GetConversationUseCase(
        mockConversationRepo as unknown as ConversationRepository,
      );

      // User B in same workspace must get 404, never 403 (prevent ID enumeration)
      await expect(useCase.execute('conv-private-1', contextUserB)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('returns 404 (NotFoundError) to user in a different workspace', async () => {
      mockConversationRepo.findById.mockResolvedValue(ownedConv);
      const useCase = new GetConversationUseCase(
        mockConversationRepo as unknown as ConversationRepository,
      );

      await expect(useCase.execute('conv-private-1', contextWorkspaceB)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('ListConversationsUseCase', () => {
    it('lists conversations for user with kind and pagination filters', async () => {
      mockConversationRepo.list.mockResolvedValue({
        items: [
          {
            id: 'conv-list-1',
            workspace_id: workspaceIdA,
            user_id: userA,
            kind: 'hub',
          },
        ],
        next_cursor: null,
      });

      const useCase = new ListConversationsUseCase(
        mockConversationRepo as unknown as ConversationRepository,
      );

      const result = await useCase.execute(
        { kind: 'hub', limit: 20 },
        contextUserA,
      );

      expect(result.items).toHaveLength(1);
      expect(mockConversationRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: workspaceIdA,
          user_id: userA,
          kind: 'hub',
          limit: 20,
        }),
      );
    });
  });

  describe('CreateMessageUseCase (Idempotency, Mentions, Room Pinning, D-M0-3)', () => {
    const hubConv: ConversationEntity = {
      id: 'conv-hub-1',
      workspace_id: workspaceIdA,
      user_id: userA,
      kind: 'hub',
      agent_slug: null,
      title: 'Hub Chat',
      title_source: 'user',
      pinned_at: null,
      archived_at: null,
      origin_message_id: null,
      origin_channel: 'web',
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const roomConv: ConversationEntity = {
      id: 'conv-room-1',
      workspace_id: workspaceIdA,
      user_id: userA,
      kind: 'room',
      agent_slug: 'sinofinance',
      title: 'Finance Room',
      title_source: 'auto',
      pinned_at: null,
      archived_at: null,
      origin_message_id: null,
      origin_channel: 'web',
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('returns existing message on repeated client_message_id (idempotent, closes API-3)', async () => {
      mockConversationRepo.findById.mockResolvedValue(hubConv);
      const existingMessage: MessageEntity = {
        id: 'msg-existing-1',
        conversation_id: 'conv-hub-1',
        role: 'user',
        agent_slug: 'sino',
        content: 'First attempt',
        mentions: null,
        status: 'completed',
        finish_reason: null,
        run_id: 'run-existing-1',
        channel: 'web',
        client_message_id: 'client-key-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockMessageRepo.findByClientMessageId.mockResolvedValue(existingMessage);

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      const result = await useCase.execute(
        'conv-hub-1',
        {
          content: 'First attempt',
          client_message_id: 'client-key-123',
        },
        contextUserA,
      );

      expect(result.message_id).toBe('msg-existing-1');
      expect(result.run_id).toBe('run-existing-1');
      expect(mockMessageRepo.create).not.toHaveBeenCalled();
    });

    it('routes hub message with leading mention to specified specialist', async () => {
      mockConversationRepo.findById.mockResolvedValue(hubConv);
      mockMessageRepo.findByClientMessageId.mockResolvedValue(null);
      mockMessageRepo.create.mockImplementation(async (input) => ({
        id: 'msg-new-1',
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      const result = await useCase.execute(
        'conv-hub-1',
        {
          content: '@SinoFinance please review this balance sheet',
          client_message_id: 'client-unique-2',
        },
        contextUserA,
      );

      expect(result.message_id).toBe('msg-new-1');
      expect(result.run_id).toMatch(/^run_/);
      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: 'conv-hub-1',
          agent_slug: 'sinofinance',
          role: 'user',
          mentions: [
            expect.objectContaining({
              agent_slug: 'sinofinance',
              handle: '@SinoFinance',
            }),
          ],
        }),
      );
      expect(mockConversationRepo.updateLastMessageAt).toHaveBeenCalledWith(
        'conv-hub-1',
        expect.any(Date),
      );
    });

    it('defaults hub message without leading mention to sino (D-M0-8)', async () => {
      mockConversationRepo.findById.mockResolvedValue(hubConv);
      mockMessageRepo.findByClientMessageId.mockResolvedValue(null);
      mockMessageRepo.create.mockImplementation(async (input) => ({
        id: 'msg-new-2',
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      await useCase.execute(
        'conv-hub-1',
        {
          content: 'Hello, what can you do for our business?',
        },
        contextUserA,
      );

      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: 'conv-hub-1',
          agent_slug: 'sino',
        }),
      );
    });

    it('rejects message addressing a different specialist in a pinned room conversation', async () => {
      mockConversationRepo.findById.mockResolvedValue(roomConv);
      mockMessageRepo.findByClientMessageId.mockResolvedValue(null);

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      await expect(
        useCase.execute(
          'conv-room-1',
          {
            content: '@SinoSales can you help me here?',
          },
          contextUserA,
        ),
      ).rejects.toThrow(ValidationError);
      expect(mockMessageRepo.create).not.toHaveBeenCalled();
    });

    it('allows message matching pinned specialist in a room conversation', async () => {
      mockConversationRepo.findById.mockResolvedValue(roomConv);
      mockMessageRepo.findByClientMessageId.mockResolvedValue(null);
      mockMessageRepo.create.mockImplementation(async (input) => ({
        id: 'msg-room-1',
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      const result = await useCase.execute(
        'conv-room-1',
        {
          content: '@SinoFinance calculate VAT',
        },
        contextUserA,
      );

      expect(result.message_id).toBe('msg-room-1');
      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: 'conv-room-1',
          agent_slug: 'sinofinance',
        }),
      );
    });

    it('enforces specialist access restrictions when user is scoped to specific specialists', async () => {
      mockConversationRepo.findById.mockResolvedValue(hubConv);

      const scopedContext: RequestContext = {
        ...contextUserA,
        allowed_specialists: ['sinopeople'], // User only allowed to use sinopeople
      };

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      // Attempting to use @SinoFinance when restricted to sinopeople
      await expect(
        useCase.execute(
          'conv-hub-1',
          {
            content: '@SinoFinance calculate invoice',
          },
          scopedContext,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it('ignores client-sent forged mentions and re-parses server-side', async () => {
      mockConversationRepo.findById.mockResolvedValue(hubConv);
      mockMessageRepo.findByClientMessageId.mockResolvedValue(null);
      mockMessageRepo.create.mockImplementation(async (input) => ({
        id: 'msg-unforged',
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const useCase = new CreateMessageUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
      );

      await useCase.execute(
        'conv-hub-1',
        {
          content: 'Plain text with no mentions',
          // Client attempts to inject forged specialist mention
          mentions: [{ agent_slug: 'forged_malicious_slug' }],
        },
        contextUserA,
      );

      // Mentions should be empty because content has no mentions
      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mentions: [],
          agent_slug: 'sino',
        }),
      );
    });
  });

  describe('ListMessagesUseCase', () => {
    it('returns messages in chronological order (created_at ASC) for owner', async () => {
      const ownedConv: ConversationEntity = {
        id: 'conv-messages-1',
        workspace_id: workspaceIdA,
        user_id: userA,
        kind: 'hub',
        agent_slug: null,
        title: 'Transcript',
        title_source: 'user',
        pinned_at: null,
        archived_at: null,
        origin_message_id: null,
        origin_channel: 'web',
        last_message_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockConversationRepo.findById.mockResolvedValue(ownedConv);
      const fakeMessages: MessageEntity[] = [
        {
          id: 'msg-1',
          conversation_id: 'conv-messages-1',
          role: 'user',
          agent_slug: 'sino',
          content: 'Hello',
          mentions: null,
          status: 'completed',
          finish_reason: null,
          run_id: 'run-1',
          channel: 'web',
          client_message_id: 'c-1',
          created_at: '2026-10-21T10:00:00.000Z',
          updated_at: '2026-10-21T10:00:00.000Z',
        },
        {
          id: 'msg-2',
          conversation_id: 'conv-messages-1',
          role: 'assistant',
          agent_slug: 'sino',
          content: 'Hi! How can I assist you?',
          mentions: null,
          status: 'completed',
          finish_reason: 'stop',
          run_id: 'run-1',
          channel: 'web',
          client_message_id: null,
          created_at: '2026-10-21T10:00:05.000Z',
          updated_at: '2026-10-21T10:00:05.000Z',
        },
      ];
      mockMessageRepo.listByConversation.mockResolvedValue({
        items: fakeMessages,
        next_cursor: null,
      });

      const useCase = new ListMessagesUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
        { createMany: vi.fn(), listByMessageIds: vi.fn().mockResolvedValue([]) },
        { validate: vi.fn(), supports: vi.fn() },
      );

      const result = await useCase.execute(
        'conv-messages-1',
        { limit: 50 },
        contextUserA,
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('msg-1');
      expect(result.items[1].id).toBe('msg-2');
    });

    it('throws 404 (NotFoundError) for another user in the same workspace', async () => {
      const ownedConv: ConversationEntity = {
        id: 'conv-messages-1',
        workspace_id: workspaceIdA,
        user_id: userA,
        kind: 'hub',
        agent_slug: null,
        title: 'Transcript',
        title_source: 'user',
        pinned_at: null,
        archived_at: null,
        origin_message_id: null,
        origin_channel: 'web',
        last_message_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockConversationRepo.findById.mockResolvedValue(ownedConv);

      const useCase = new ListMessagesUseCase(
        mockConversationRepo as unknown as ConversationRepository,
        mockMessageRepo as unknown as MessageRepository,
        { createMany: vi.fn(), listByMessageIds: vi.fn().mockResolvedValue([]) },
        { validate: vi.fn(), supports: vi.fn() },
      );

      await expect(
        useCase.execute('conv-messages-1', { limit: 50 }, contextUserB),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
