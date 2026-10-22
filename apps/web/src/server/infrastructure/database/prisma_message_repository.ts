import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  MentionEntity,
  MessageEntity,
  MessageRole,
  MessageStatus,
} from '@/server/domain/entities/message';
import type {
  CreateMessageInput,
  ListMessagesFilter,
  MessageRepository,
} from '@/server/domain/repositories/message_repository';
import { activeClient } from './prisma_transaction_runner';
import type { InputJsonValue } from '@/server/infrastructure/database/generated/internal/prismaNamespace';

function mapMessage(row: {
  id: string;
  conversation_id: string;
  role: string;
  agent_slug: string | null;
  content: string;
  mentions: unknown;
  status: string;
  finish_reason: string | null;
  run_id: string | null;
  channel: string | null;
  client_message_id: string | null;
  created_at: Date;
  updated_at: Date;
}): MessageEntity {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role as MessageRole,
    agent_slug: row.agent_slug,
    content: row.content,
    mentions: Array.isArray(row.mentions) ? (row.mentions as MentionEntity[]) : null,
    status: row.status as MessageStatus,
    finish_reason: row.finish_reason,
    run_id: row.run_id,
    channel: row.channel,
    client_message_id: row.client_message_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateMessageInput): Promise<MessageEntity> {
    const row = await this.prisma.message.create({
      data: {
        conversation_id: input.conversation_id,
        role: input.role,
        agent_slug: input.agent_slug ?? null,
        content: input.content,
        mentions: (input.mentions as unknown as InputJsonValue) ?? undefined,
        status: input.status ?? 'completed',
        finish_reason: input.finish_reason ?? null,
        run_id: input.run_id ?? null,
        channel: input.channel ?? 'web',
        client_message_id: input.client_message_id ?? null,
      },
    });
    return mapMessage(row);
  }

  async findByClientMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageEntity | null> {
    const row = await this.prisma.message.findFirst({
      where: {
        conversation_id: conversationId,
        client_message_id: clientMessageId,
      },
    });
    return row ? mapMessage(row) : null;
  }

  async findUserMessageByRunId(runId: string): Promise<MessageEntity | null> {
    const row = await this.prisma.message.findFirst({
      where: { run_id: runId, role: 'user' },
      orderBy: { created_at: 'asc' },
    });
    return row ? mapMessage(row) : null;
  }

  async countByConversation(conversationId: string): Promise<number> {
    // Reads through the active client so a count taken inside a transaction
    // sees the same rows the transaction is about to delete.
    return activeClient(this.prisma).message.count({ where: { conversation_id: conversationId } });
  }

  async listByConversation(filter: ListMessagesFilter): Promise<{
    items: MessageEntity[];
    next_cursor: string | null;
  }> {
    const limit = filter.limit ?? 50;

    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: filter.conversation_id,
      },
      orderBy: {
        created_at: 'asc',
      },
      take: limit + 1,
      ...(filter.cursor
        ? {
            cursor: { id: filter.cursor },
            skip: 1,
          }
        : {}),
    });

    let next_cursor: string | null = null;
    if (rows.length > limit) {
      const nextItem = rows[limit];
      next_cursor = nextItem ? nextItem.id : null;
      rows.pop();
    }

    return {
      items: rows.map(mapMessage),
      next_cursor,
    };
  }
}
