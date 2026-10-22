import 'server-only';
import type { Prisma, PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  NewSquadTurn,
  SquadHandoffEntity,
  SquadHandoffStatus,
  SquadTerminationReason,
  SquadTurnEntity,
  SquadTurnRepository,
  SquadTurnStatus,
} from '@/server/domain/squads/squad_ports';
import { activeClient } from './prisma_transaction_runner';

const WITH_HANDOFFS = { handoffs: { orderBy: { position: 'asc' as const } } };
type TurnRow = Prisma.SquadTurnGetPayload<{ include: typeof WITH_HANDOFFS }>;

function toEntity(row: TurnRow): SquadTurnEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    squad_id: row.squad_id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    run_handle: row.run_handle,
    lead_slug: row.lead_slug,
    direct_slug: row.direct_slug,
    ceiling_points: row.ceiling_points,
    status: row.status as SquadTurnStatus,
    termination_reason: row.termination_reason as SquadTerminationReason | null,
    delegation_count: row.delegation_count,
    points: row.points,
    created_at: row.created_at.toISOString(),
    finished_at: row.finished_at?.toISOString() ?? null,
    handoffs: row.handoffs.map(
      (handoff): SquadHandoffEntity => ({
        delegation_id: handoff.delegation_id,
        position: handoff.position,
        from_slug: handoff.from_slug,
        to_slug: handoff.to_slug,
        task_summary: handoff.task_summary,
        parallel_group: handoff.parallel_group,
        status: handoff.status as SquadHandoffStatus,
        summary: handoff.summary,
        error_code: handoff.error_code,
        points: handoff.points,
      }),
    ),
  };
}

export class PrismaSquadTurnRepository implements SquadTurnRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async start(input: NewSquadTurn): Promise<SquadTurnEntity> {
    const client = activeClient(this.prisma);
    // Upsert on the unique handle: two attaches to one run share one turn.
    const row = await client.squadTurn.upsert({
      where: { run_handle: input.run_handle },
      create: { ...input },
      update: {},
      include: WITH_HANDOFFS,
    });
    return toEntity(row);
  }

  async findByRunHandle(runHandle: string): Promise<SquadTurnEntity | null> {
    const row = await this.prisma.squadTurn.findUnique({ where: { run_handle: runHandle }, include: WITH_HANDOFFS });
    return row ? toEntity(row) : null;
  }

  async recordHandoff(
    turnId: string,
    input: { delegation_id: string; from_slug: string; to_slug: string; task_summary: string; parallel_group: number | null },
  ): Promise<void> {
    const client = activeClient(this.prisma);
    const existing = await client.squadHandoff.findUnique({
      where: { turn_id_delegation_id: { turn_id: turnId, delegation_id: input.delegation_id } },
      select: { id: true },
    });
    if (existing) return;
    const position = await client.squadHandoff.count({ where: { turn_id: turnId } });
    // The unique pair is the backstop when two replays race: the loser is a no-op.
    await client.squadHandoff.createMany({ data: [{ turn_id: turnId, position, ...input }], skipDuplicates: true });
    await client.squadTurn.update({ where: { id: turnId }, data: { delegation_count: position + 1 } });
  }

  async recordHandoffResult(
    turnId: string,
    input: { delegation_id: string; status: SquadHandoffStatus; summary: string | null; error_code: string | null; points: number | null },
  ): Promise<void> {
    await activeClient(this.prisma).squadHandoff.updateMany({
      where: { turn_id: turnId, delegation_id: input.delegation_id },
      data: {
        status: input.status,
        summary: input.summary,
        error_code: input.error_code,
        points: input.points === null ? null : Math.round(input.points),
        updated_at: new Date(),
      },
    });
  }

  async recordLimit(turnId: string, reason: SquadTerminationReason): Promise<void> {
    await activeClient(this.prisma).squadTurn.update({ where: { id: turnId }, data: { termination_reason: reason } });
  }

  async finish(
    turnId: string,
    input: { status: SquadTurnStatus; termination_reason: SquadTerminationReason | null; delegation_count: number | null; points: number | null },
  ): Promise<void> {
    await activeClient(this.prisma).squadTurn.update({
      where: { id: turnId },
      data: {
        status: input.status,
        // A reason a `turn_limit` event already stored is kept when the done frame carries none.
        ...(input.termination_reason !== null ? { termination_reason: input.termination_reason } : {}),
        ...(input.delegation_count !== null ? { delegation_count: input.delegation_count } : {}),
        ...(input.points !== null ? { points: Math.round(input.points) } : {}),
        finished_at: new Date(),
      },
    });
  }

  async listByConversation(workspaceId: string, conversationId: string): Promise<SquadTurnEntity[]> {
    const rows = await this.prisma.squadTurn.findMany({
      where: { workspace_id: workspaceId, conversation_id: conversationId },
      include: WITH_HANDOFFS,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(toEntity);
  }

  async listBySquad(
    workspaceId: string,
    squadId: string,
    filter: { user_id?: string; limit: number },
  ): Promise<SquadTurnEntity[]> {
    const rows = await this.prisma.squadTurn.findMany({
      where: { workspace_id: workspaceId, squad_id: squadId, ...(filter.user_id ? { user_id: filter.user_id } : {}) },
      include: WITH_HANDOFFS,
      orderBy: { created_at: 'desc' },
      take: filter.limit,
    });
    return rows.map(toEntity);
  }
}
