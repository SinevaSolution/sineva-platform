import { randomUUID } from 'node:crypto';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type { MessageEntity } from '@/server/domain/entities/message';
import type { ChatRunEntity, ChatRunStatus } from '@/server/domain/entities/chat_run';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type {
  CreateMessageInput,
  MessageRepository,
} from '@/server/domain/repositories/message_repository';
import type {
  ChatRunRepository,
  FindOrCreateChatRunInput,
} from '@/server/domain/repositories/chat_run_repository';

/** In-memory ports for the run relay tests: no database, same semantics. */
export class InMemoryConversations implements ConversationRepository {
  readonly rows = new Map<string, ConversationEntity>();
  lastMessageAtUpdates = 0;

  async findById(id: string): Promise<ConversationEntity | null> {
    return this.rows.get(id) ?? null;
  }
  async create(): Promise<ConversationEntity> {
    throw new Error('not used by the relay tests');
  }
  async list(): Promise<{ items: ConversationEntity[]; next_cursor: string | null }> {
    throw new Error('not used by the relay tests');
  }
  async updateLastMessageAt(): Promise<void> {
    this.lastMessageAtUpdates += 1;
  }
  async rename(id: string, title: string): Promise<ConversationEntity> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`conversation ${id} not found`);
    row.title = title;
    row.title_source = 'user';
    return { ...row };
  }
  /** Callbacks standing in for the database's ON DELETE CASCADE. */
  readonly cascades: Array<(conversationId: string) => void> = [];
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
    for (const cascade of this.cascades) cascade(id);
  }
}

export class InMemoryMessages implements MessageRepository {
  readonly rows: MessageEntity[] = [];

  async create(input: CreateMessageInput): Promise<MessageEntity> {
    const now = new Date().toISOString();
    const row: MessageEntity = {
      id: randomUUID(),
      conversation_id: input.conversation_id,
      role: input.role,
      agent_slug: input.agent_slug ?? null,
      content: input.content,
      mentions: input.mentions ?? null,
      status: input.status ?? 'completed',
      finish_reason: input.finish_reason ?? null,
      run_id: input.run_id ?? null,
      channel: input.channel ?? 'web',
      client_message_id: input.client_message_id ?? null,
      created_at: now,
      updated_at: now,
    };
    this.rows.push(row);
    return row;
  }
  async findByClientMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageEntity | null> {
    return (
      this.rows.find(
        (m) => m.conversation_id === conversationId && m.client_message_id === clientMessageId,
      ) ?? null
    );
  }
  async findUserMessageByRunId(runId: string): Promise<MessageEntity | null> {
    return this.rows.find((m) => m.run_id === runId && m.role === 'user') ?? null;
  }
  async countByConversation(conversationId: string): Promise<number> {
    return this.rows.filter((m) => m.conversation_id === conversationId).length;
  }
  async listByConversation(): Promise<{ items: MessageEntity[]; next_cursor: string | null }> {
    throw new Error('not used by the relay tests');
  }

  assistantMessages(): MessageEntity[] {
    return this.rows.filter((m) => m.role === 'assistant');
  }
}

export class InMemoryChatRuns implements ChatRunRepository {
  readonly rows = new Map<string, ChatRunEntity>();

  private byId(id: string): ChatRunEntity {
    const row = [...this.rows.values()].find((r) => r.id === id);
    if (!row) throw new Error(`chat run ${id} not found`);
    return row;
  }

  async findByHandle(runHandle: string): Promise<ChatRunEntity | null> {
    const row = this.rows.get(runHandle);
    return row ? { ...row } : null;
  }

  async findOrCreate(input: FindOrCreateChatRunInput): Promise<ChatRunEntity> {
    const existing = this.rows.get(input.run_handle);
    if (existing) return { ...existing };
    const now = new Date().toISOString();
    const row: ChatRunEntity = {
      id: randomUUID(),
      ...input,
      status: 'pending',
      upstream_run_id: null,
      upstream_session_id: null,
      assistant_message_id: null,
      error_code: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(input.run_handle, row);
    return { ...row };
  }

  async claimStart(id: string): Promise<boolean> {
    const row = this.byId(id);
    if (row.status !== 'pending') return false;
    row.status = 'streaming';
    return true;
  }

  async releaseStart(id: string, errorCode: string): Promise<void> {
    const row = this.byId(id);
    row.status = 'pending';
    row.error_code = errorCode;
  }

  async recordUpstream(
    id: string,
    ids: { upstream_run_id?: string | null; upstream_session_id?: string | null },
  ): Promise<void> {
    const row = this.byId(id);
    if (ids.upstream_run_id !== undefined) row.upstream_run_id = ids.upstream_run_id;
    if (ids.upstream_session_id !== undefined) row.upstream_session_id = ids.upstream_session_id;
  }

  async finalize(
    id: string,
    input: { from: ChatRunStatus[]; status: ChatRunStatus; error_code?: string | null },
  ): Promise<boolean> {
    const row = this.byId(id);
    if (!input.from.includes(row.status)) return false;
    row.status = input.status;
    row.error_code = input.error_code ?? null;
    return true;
  }

  async setAssistantMessage(id: string, assistantMessageId: string): Promise<void> {
    this.byId(id).assistant_message_id = assistantMessageId;
  }

  async listByConversation(conversationId: string): Promise<ChatRunEntity[]> {
    return [...this.rows.values()]
      .filter((r) => r.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({ ...r }));
  }

  async findLatestSessionId(conversationId: string): Promise<string | null> {
    const rows = [...this.rows.values()]
      .filter((r) => r.conversation_id === conversationId && r.upstream_session_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows[0]?.upstream_session_id ?? null;
  }

  get(handle: string): ChatRunEntity {
    const row = this.rows.get(handle);
    if (!row) throw new Error(`no run ${handle}`);
    return row;
  }
}
