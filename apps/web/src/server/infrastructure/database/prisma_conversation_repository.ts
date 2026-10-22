import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  ConversationEntity,
  ConversationKind,
  ConversationTitleSource,
} from '@/server/domain/entities/conversation';
import type {
  ConversationRepository,
  CreateConversationInput,
  ListConversationsFilter,
} from '@/server/domain/repositories/conversation_repository';
import { activeClient } from './prisma_transaction_runner';

function mapConversation(row: {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: string;
  agent_slug: string | null;
  title: string | null;
  title_source: string | null;
  pinned_at: Date | null;
  archived_at: Date | null;
  origin_message_id: string | null;
  origin_channel: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): ConversationEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    kind: row.kind as ConversationKind,
    agent_slug: row.agent_slug,
    title: row.title,
    title_source: row.title_source as ConversationTitleSource | null,
    pinned_at: row.pinned_at?.toISOString() ?? null,
    archived_at: row.archived_at?.toISOString() ?? null,
    origin_message_id: row.origin_message_id,
    origin_channel: row.origin_channel,
    last_message_at: row.last_message_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ConversationEntity | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
    });
    return row ? mapConversation(row) : null;
  }

  async create(input: CreateConversationInput): Promise<ConversationEntity> {
    const row = await activeClient(this.prisma).conversation.create({
      data: {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        kind: input.kind,
        agent_slug: input.agent_slug ?? null,
        title: input.title ?? null,
        title_source: input.title_source ?? null,
        origin_message_id: input.origin_message_id ?? null,
        origin_channel: input.origin_channel ?? 'web',
      },
    });
    return mapConversation(row);
  }

  async list(filter: ListConversationsFilter): Promise<{
    items: ConversationEntity[];
    next_cursor: string | null;
  }> {
    const limit = filter.limit ?? 50;
    const whereClause: {
      workspace_id: string;
      user_id: string;
      kind?: string;
      agent_slug?: string;
    } = {
      workspace_id: filter.workspace_id,
      user_id: filter.user_id,
    };

    if (filter.kind) {
      whereClause.kind = filter.kind;
    }
    if (filter.agent_slug) {
      whereClause.agent_slug = filter.agent_slug;
    }

    const rows = await this.prisma.conversation.findMany({
      where: whereClause,
      orderBy: [
        { last_message_at: 'desc' },
        { created_at: 'desc' },
      ],
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
      items: rows.map(mapConversation),
      next_cursor,
    };
  }

  async updateLastMessageAt(id: string, date: Date): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: {
        last_message_at: date,
      },
    });
  }
}
