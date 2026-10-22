import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { ChatRunEntity, ChatRunStatus } from '@/server/domain/entities/chat_run';
import type {
  ChatRunRepository,
  FindOrCreateChatRunInput,
} from '@/server/domain/repositories/chat_run_repository';

function mapChatRun(row: {
  id: string;
  workspace_id: string;
  conversation_id: string;
  user_message_id: string;
  run_handle: string;
  agent_slug: string;
  status: string;
  upstream_run_id: string | null;
  upstream_session_id: string | null;
  assistant_message_id: string | null;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
}): ChatRunEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    conversation_id: row.conversation_id,
    user_message_id: row.user_message_id,
    run_handle: row.run_handle,
    agent_slug: row.agent_slug,
    status: row.status as ChatRunStatus,
    upstream_run_id: row.upstream_run_id,
    upstream_session_id: row.upstream_session_id,
    assistant_message_id: row.assistant_message_id,
    error_code: row.error_code,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PrismaChatRunRepository implements ChatRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByHandle(runHandle: string): Promise<ChatRunEntity | null> {
    const row = await this.prisma.chatRun.findUnique({ where: { run_handle: runHandle } });
    return row ? mapChatRun(row) : null;
  }

  async findOrCreate(input: FindOrCreateChatRunInput): Promise<ChatRunEntity> {
    // Upsert on the unique handle: two simultaneous first attaches end up
    // with the same row instead of one of them failing on the constraint.
    const row = await this.prisma.chatRun.upsert({
      where: { run_handle: input.run_handle },
      create: {
        workspace_id: input.workspace_id,
        conversation_id: input.conversation_id,
        user_message_id: input.user_message_id,
        run_handle: input.run_handle,
        agent_slug: input.agent_slug,
      },
      update: {},
    });
    return mapChatRun(row);
  }

  async claimStart(id: string): Promise<boolean> {
    // The WHERE on status is the lock: of two concurrent callers exactly one
    // updates a row.
    const result = await this.prisma.chatRun.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'streaming', error_code: null },
    });
    return result.count === 1;
  }

  async releaseStart(id: string, errorCode: string): Promise<void> {
    await this.prisma.chatRun.updateMany({
      where: { id, status: 'streaming' },
      data: { status: 'pending', error_code: errorCode },
    });
  }

  async recordUpstream(
    id: string,
    ids: { upstream_run_id?: string | null; upstream_session_id?: string | null },
  ): Promise<void> {
    await this.prisma.chatRun.update({
      where: { id },
      data: {
        ...(ids.upstream_run_id !== undefined ? { upstream_run_id: ids.upstream_run_id } : {}),
        ...(ids.upstream_session_id !== undefined
          ? { upstream_session_id: ids.upstream_session_id }
          : {}),
      },
    });
  }

  async finalize(
    id: string,
    input: { from: ChatRunStatus[]; status: ChatRunStatus; error_code?: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.chatRun.updateMany({
      where: { id, status: { in: input.from } },
      data: { status: input.status, error_code: input.error_code ?? null },
    });
    return result.count === 1;
  }

  async setAssistantMessage(id: string, assistantMessageId: string): Promise<void> {
    await this.prisma.chatRun.update({
      where: { id },
      data: { assistant_message_id: assistantMessageId },
    });
  }

  async findLatestSessionId(conversationId: string): Promise<string | null> {
    const row = await this.prisma.chatRun.findFirst({
      where: { conversation_id: conversationId, upstream_session_id: { not: null } },
      orderBy: { created_at: 'desc' },
      select: { upstream_session_id: true },
    });
    return row?.upstream_session_id ?? null;
  }
}
