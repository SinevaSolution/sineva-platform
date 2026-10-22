import 'server-only';
import type { Prisma, PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { SquadEntity, SquadLeadType, SquadLimits, SquadStatus } from '@/server/domain/squads/squad';
import type { NewSquad, SquadPatch, SquadRepository } from '@/server/domain/squads/squad_ports';
import { activeClient } from './prisma_transaction_runner';

const WITH_MEMBERS = { members: { orderBy: { position: 'asc' as const } } };

type SquadRow = Prisma.SquadGetPayload<{ include: typeof WITH_MEMBERS }>;

function toEntity(row: SquadRow): SquadEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    goal: row.goal,
    lead_type: row.lead_type as SquadLeadType,
    lead_agent_slug: row.lead_agent_slug,
    template_slug: row.template_slug,
    status: row.status as SquadStatus,
    limits: (row.limits as SquadLimits | null) ?? null,
    created_by: row.created_by,
    archived_at: row.archived_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    members: row.members.map((member) => ({
      agent_slug: member.agent_slug,
      position: member.position,
      added_by: member.added_by,
      added_at: member.added_at.toISOString(),
    })),
  };
}

export class PrismaSquadRepository implements SquadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(workspaceId: string, filter?: { status?: SquadStatus }): Promise<SquadEntity[]> {
    const rows = await this.prisma.squad.findMany({
      where: { workspace_id: workspaceId, ...(filter?.status ? { status: filter.status } : {}) },
      include: WITH_MEMBERS,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toEntity);
  }

  async findById(workspaceId: string, squadId: string): Promise<SquadEntity | null> {
    const row = await activeClient(this.prisma).squad.findFirst({
      where: { id: squadId, workspace_id: workspaceId },
      include: WITH_MEMBERS,
    });
    return row ? toEntity(row) : null;
  }

  countActive(workspaceId: string): Promise<number> {
    return this.prisma.squad.count({ where: { workspace_id: workspaceId, status: 'active' } });
  }

  async existingActiveIds(workspaceId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.squad.findMany({
      where: { workspace_id: workspaceId, status: 'active', id: { in: ids } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async create(input: NewSquad): Promise<SquadEntity> {
    const row = await activeClient(this.prisma).squad.create({
      data: {
        workspace_id: input.workspace_id,
        name: input.name,
        goal: input.goal,
        lead_type: input.lead_type,
        lead_agent_slug: input.lead_agent_slug,
        template_slug: input.template_slug,
        limits: input.limits === null ? undefined : (input.limits as Prisma.InputJsonValue),
        created_by: input.created_by,
        members: {
          create: input.member_slugs.map((agent_slug, position) => ({
            agent_slug,
            position,
            added_by: input.created_by,
          })),
        },
      },
      include: WITH_MEMBERS,
    });
    return toEntity(row);
  }

  async update(workspaceId: string, squadId: string, patch: SquadPatch): Promise<SquadEntity> {
    const client = activeClient(this.prisma);
    // updateMany first keeps the workspace in the where clause: another
    // workspace's id updates nothing instead of reaching its row.
    const result = await client.squad.updateMany({
      where: { id: squadId, workspace_id: workspaceId },
      data: {
        ...patch,
        limits: patch.limits === undefined ? undefined : patch.limits === null ? undefined : (patch.limits as Prisma.InputJsonValue),
        // `updated_at` does not update itself (known debt), so every write sets it.
        updated_at: new Date(),
      },
    });
    if (result.count === 0) throw new Error('squad not found');
    const row = await client.squad.findFirstOrThrow({ where: { id: squadId, workspace_id: workspaceId }, include: WITH_MEMBERS });
    return toEntity(row);
  }

  async replaceMembers(workspaceId: string, squadId: string, memberSlugs: string[], addedBy: string): Promise<SquadEntity> {
    const client = activeClient(this.prisma);
    const squad = await client.squad.findFirstOrThrow({
      where: { id: squadId, workspace_id: workspaceId },
      include: WITH_MEMBERS,
    });
    const keep = new Set(memberSlugs);
    await client.squadMember.deleteMany({
      where: { squad_id: squad.id, agent_slug: { notIn: [...keep] } },
    });
    const existing = new Set(squad.members.map((member) => member.agent_slug));
    // Order is the position, so staying members are renumbered as well as new ones added.
    for (const [position, agent_slug] of memberSlugs.entries()) {
      if (existing.has(agent_slug)) {
        await client.squadMember.update({
          where: { squad_id_agent_slug: { squad_id: squad.id, agent_slug } },
          data: { position },
        });
      } else {
        await client.squadMember.create({ data: { squad_id: squad.id, agent_slug, position, added_by: addedBy } });
      }
    }
    await client.squad.update({ where: { id: squad.id }, data: { updated_at: new Date() } });
    const row = await client.squad.findFirstOrThrow({ where: { id: squad.id }, include: WITH_MEMBERS });
    return toEntity(row);
  }

  async delete(workspaceId: string, squadId: string): Promise<void> {
    // deleteMany: a concurrent second delete is a no-op instead of a P2025.
    await activeClient(this.prisma).squad.deleteMany({ where: { id: squadId, workspace_id: workspaceId } });
  }

  async hasAccessOverride(squadId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.squadAccessOverride.findUnique({
      where: { squad_id_user_id: { squad_id: squadId, user_id: userId } },
      select: { id: true },
    });
    return row !== null;
  }

  async setAccessOverride(squadId: string, userId: string, grantedBy: string, granted: boolean): Promise<void> {
    const client = activeClient(this.prisma);
    if (!granted) {
      await client.squadAccessOverride.deleteMany({ where: { squad_id: squadId, user_id: userId } });
      return;
    }
    await client.squadAccessOverride.upsert({
      where: { squad_id_user_id: { squad_id: squadId, user_id: userId } },
      create: { squad_id: squadId, user_id: userId, granted_by: grantedBy },
      update: { granted_by: grantedBy, granted_at: new Date() },
    });
  }
}
