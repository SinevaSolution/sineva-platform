import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { InputJsonValue } from '@/server/infrastructure/database/generated/internal/prismaNamespace';
import type {
  MessageCardEntity,
  MessageCardState,
  MessageCardValidationStatus,
} from '@/server/domain/entities/message_card';
import type {
  MessageCardRepository,
  NewMessageCard,
} from '@/server/domain/repositories/message_card_repository';

function mapCard(row: {
  id: string;
  message_id: string;
  conversation_id: string;
  workspace_id: string;
  run_id: string | null;
  call_id: string | null;
  position: number;
  card_type: string;
  schema_version: number;
  state: string;
  provider_slug: string | null;
  connection_id: string | null;
  approval_id: string | null;
  data: unknown;
  actions: unknown;
  fallback_text: string | null;
  payload_hash: string | null;
  validation_status: string;
  rejected_code: string | null;
  search_text: string | null;
  version: number;
  data_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): MessageCardEntity {
  return {
    id: row.id,
    message_id: row.message_id,
    conversation_id: row.conversation_id,
    workspace_id: row.workspace_id,
    run_id: row.run_id,
    call_id: row.call_id,
    position: row.position,
    card_type: row.card_type,
    schema_version: row.schema_version,
    state: row.state as MessageCardState,
    provider_slug: row.provider_slug,
    connection_id: row.connection_id,
    approval_id: row.approval_id,
    data:
      typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {},
    actions: Array.isArray(row.actions) ? (row.actions as unknown[]) : [],
    fallback_text: row.fallback_text,
    payload_hash: row.payload_hash,
    validation_status: row.validation_status as MessageCardValidationStatus,
    rejected_code: row.rejected_code,
    search_text: row.search_text,
    version: row.version,
    data_expires_at: row.data_expires_at ? row.data_expires_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PrismaMessageCardRepository implements MessageCardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createMany(cards: NewMessageCard[]): Promise<MessageCardEntity[]> {
    if (cards.length === 0) return [];
    // One transaction: a unique violation on (message_id, position) rolls the
    // whole batch back instead of leaving a message with part of its cards.
    const rows = await this.prisma.$transaction(
      cards.map((card) =>
        this.prisma.messageCard.create({
          data: {
            message_id: card.message_id,
            conversation_id: card.conversation_id,
            workspace_id: card.workspace_id,
            run_id: card.run_id,
            call_id: card.call_id,
            position: card.position,
            card_type: card.card_type,
            schema_version: card.schema_version,
            state: card.state,
            provider_slug: card.provider_slug,
            connection_id: card.connection_id,
            approval_id: card.approval_id,
            data: card.data as InputJsonValue,
            actions: card.actions as InputJsonValue,
            fallback_text: card.fallback_text,
            payload_hash: card.payload_hash,
            validation_status: card.validation_status,
            rejected_code: card.rejected_code,
            search_text: card.search_text,
            data_expires_at: card.data_expires_at ? new Date(card.data_expires_at) : null,
          },
        }),
      ),
    );
    return rows.map(mapCard);
  }

  async listByMessageIds(workspaceId: string, messageIds: string[]): Promise<MessageCardEntity[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.prisma.messageCard.findMany({
      where: { workspace_id: workspaceId, message_id: { in: messageIds } },
      orderBy: [{ message_id: 'asc' }, { position: 'asc' }],
    });
    return rows.map(mapCard);
  }
}
