import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import type {
  CreateConversationInput,
  ListConversationsFilter,
} from '@/server/domain/repositories/conversation_repository';
import { UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import type { SquadEntity, SquadRosterEntry } from '@/server/domain/squads/squad';
import type {
  MemberToolPolicy,
  NewSquad,
  NewSquadTurn,
  SquadHandoffEntity,
  SquadHandoffStatus,
  SquadPatch,
  SquadRepository,
  SquadSpecialistDirectory,
  SquadTerminationReason,
  SquadTurnEntity,
  SquadTurnRepository,
  SquadTurnStatus,
} from '@/server/domain/squads/squad_ports';
import { InMemoryConversations } from './in_memory_chat_store';

export const SQUAD_SLUGS = ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp', 'sinoinsights'];

export class InMemorySquads implements SquadRepository {
  readonly rows = new Map<string, SquadEntity>();
  readonly overrides = new Set<string>();
  /** Registered by the transaction fake so a throw rolls the write back. */
  onWrite: (undo: () => void) => void = () => undefined;

  async list(workspaceId: string, filter?: { status?: 'active' | 'archived' }): Promise<SquadEntity[]> {
    return [...this.rows.values()]
      .filter((s) => s.workspace_id === workspaceId && (!filter?.status || s.status === filter.status))
      .map((s) => structuredClone(s));
  }
  async findById(workspaceId: string, squadId: string): Promise<SquadEntity | null> {
    const row = this.rows.get(squadId);
    return row && row.workspace_id === workspaceId ? structuredClone(row) : null;
  }
  async countActive(workspaceId: string): Promise<number> {
    return [...this.rows.values()].filter((s) => s.workspace_id === workspaceId && s.status === 'active').length;
  }
  async existingActiveIds(workspaceId: string, ids: string[]): Promise<string[]> {
    return ids.filter((id) => {
      const row = this.rows.get(id);
      return row?.workspace_id === workspaceId && row.status === 'active';
    });
  }
  async create(input: NewSquad): Promise<SquadEntity> {
    const now = new Date().toISOString();
    const squad: SquadEntity = {
      id: randomUUID(),
      workspace_id: input.workspace_id,
      name: input.name,
      goal: input.goal,
      lead_type: input.lead_type,
      lead_agent_slug: input.lead_agent_slug,
      template_slug: input.template_slug,
      status: 'active',
      limits: input.limits,
      created_by: input.created_by,
      archived_at: null,
      created_at: now,
      updated_at: now,
      members: input.member_slugs.map((agent_slug, position) => ({ agent_slug, position, added_by: input.created_by, added_at: now })),
    };
    this.rows.set(squad.id, squad);
    this.onWrite(() => this.rows.delete(squad.id));
    return structuredClone(squad);
  }
  async update(workspaceId: string, squadId: string, patch: SquadPatch): Promise<SquadEntity> {
    const row = this.rows.get(squadId);
    if (!row || row.workspace_id !== workspaceId) throw new Error('squad not found');
    const before = structuredClone(row);
    this.onWrite(() => this.rows.set(squadId, before));
    Object.assign(row, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
      ...(patch.lead_type !== undefined ? { lead_type: patch.lead_type } : {}),
      ...(patch.lead_agent_slug !== undefined ? { lead_agent_slug: patch.lead_agent_slug } : {}),
      ...(patch.limits !== undefined ? { limits: patch.limits } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.archived_at !== undefined ? { archived_at: patch.archived_at ? patch.archived_at.toISOString() : null } : {}),
    });
    return structuredClone(row);
  }
  async replaceMembers(workspaceId: string, squadId: string, memberSlugs: string[], addedBy: string): Promise<SquadEntity> {
    const row = this.rows.get(squadId);
    if (!row || row.workspace_id !== workspaceId) throw new Error('squad not found');
    const before = structuredClone(row);
    this.onWrite(() => this.rows.set(squadId, before));
    const now = new Date().toISOString();
    row.members = memberSlugs.map((agent_slug, position) => {
      const kept = before.members.find((m) => m.agent_slug === agent_slug);
      return { agent_slug, position, added_by: kept?.added_by ?? addedBy, added_at: kept?.added_at ?? now };
    });
    return structuredClone(row);
  }
  async delete(workspaceId: string, squadId: string): Promise<void> {
    const row = this.rows.get(squadId);
    if (row && row.workspace_id === workspaceId) {
      this.rows.delete(squadId);
      this.onWrite(() => this.rows.set(squadId, row));
    }
  }
  async hasAccessOverride(squadId: string, userId: string): Promise<boolean> {
    return this.overrides.has(`${squadId}:${userId}`);
  }
  async setAccessOverride(squadId: string, userId: string, _grantedBy: string, granted: boolean): Promise<void> {
    const key = `${squadId}:${userId}`;
    if (granted) this.overrides.add(key);
    else this.overrides.delete(key);
  }
}

export class FakeSquadDirectory implements SquadSpecialistDirectory {
  entries: SquadRosterEntry[] = SQUAD_SLUGS.map((agent_slug) => ({ agent_slug, enabled: true, accessible: true }));
  failure: Error | null = null;
  async roster(context: RequestContext): Promise<SquadRosterEntry[]> {
    if (this.failure) throw this.failure;
    return this.entries.map((entry) => ({
      ...entry,
      accessible: entry.accessible && (context.specialist_scope !== 'selected' || (context.allowed_specialists ?? []).includes(entry.agent_slug)),
    }));
  }
  down(): void {
    this.failure = new UpstreamUnavailableError();
  }
}

export class FakeMemberToolPolicy implements MemberToolPolicy {
  tools: Record<string, string[]> = {};
  async allowedTools(input: { agent_slug: string }): Promise<string[]> {
    return this.tools[input.agent_slug] ?? [];
  }
}

/** Conversations with create and list, which the relay fakes do not need. */
export class SquadConversations extends InMemoryConversations {
  override async create(input: CreateConversationInput): Promise<ConversationEntity> {
    const now = new Date().toISOString();
    const row: ConversationEntity = {
      id: randomUUID(),
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      kind: input.kind,
      agent_slug: input.agent_slug ?? null,
      squad_id: input.squad_id ?? null,
      title: input.title ?? null,
      title_source: input.title_source ?? null,
      pinned_at: null,
      archived_at: null,
      origin_message_id: null,
      origin_channel: input.origin_channel ?? 'web',
      last_message_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  override async list(filter: ListConversationsFilter): Promise<{ items: ConversationEntity[]; next_cursor: string | null }> {
    const items = [...this.rows.values()].filter(
      (c) =>
        c.workspace_id === filter.workspace_id &&
        c.user_id === filter.user_id &&
        (filter.kind ? c.kind === filter.kind : c.kind !== 'squad') &&
        (!filter.squad_id || c.squad_id === filter.squad_id),
    );
    return { items, next_cursor: null };
  }
}

export class InMemorySquadTurns implements SquadTurnRepository {
  readonly rows = new Map<string, SquadTurnEntity>();

  private byId(id: string): SquadTurnEntity {
    const row = [...this.rows.values()].find((t) => t.id === id);
    if (!row) throw new Error('turn not found');
    return row;
  }
  async start(input: NewSquadTurn): Promise<SquadTurnEntity> {
    const existing = this.rows.get(input.run_handle);
    if (existing) return structuredClone(existing);
    const row: SquadTurnEntity = {
      id: randomUUID(),
      ...input,
      status: 'running',
      termination_reason: null,
      delegation_count: 0,
      points: null,
      created_at: new Date().toISOString(),
      finished_at: null,
      handoffs: [],
    };
    this.rows.set(input.run_handle, row);
    return structuredClone(row);
  }
  async findByRunHandle(runHandle: string): Promise<SquadTurnEntity | null> {
    const row = this.rows.get(runHandle);
    return row ? structuredClone(row) : null;
  }
  async recordHandoff(
    turnId: string,
    input: { delegation_id: string; from_slug: string; to_slug: string; task_summary: string; parallel_group: number | null },
  ): Promise<void> {
    const turn = this.byId(turnId);
    if (turn.handoffs.some((h) => h.delegation_id === input.delegation_id)) return;
    const handoff: SquadHandoffEntity = {
      ...input,
      position: turn.handoffs.length,
      status: 'working',
      summary: null,
      error_code: null,
      points: null,
    };
    turn.handoffs.push(handoff);
    turn.delegation_count = turn.handoffs.length;
  }
  async recordHandoffResult(
    turnId: string,
    input: { delegation_id: string; status: SquadHandoffStatus; summary: string | null; error_code: string | null; points: number | null },
  ): Promise<void> {
    const handoff = this.byId(turnId).handoffs.find((h) => h.delegation_id === input.delegation_id);
    if (handoff) Object.assign(handoff, { status: input.status, summary: input.summary, error_code: input.error_code, points: input.points });
  }
  async recordLimit(turnId: string, reason: SquadTerminationReason): Promise<void> {
    this.byId(turnId).termination_reason = reason;
  }
  async finish(
    turnId: string,
    input: { status: SquadTurnStatus; termination_reason: SquadTerminationReason | null; delegation_count: number | null; points: number | null },
  ): Promise<void> {
    const turn = this.byId(turnId);
    turn.status = input.status;
    turn.termination_reason = input.termination_reason ?? turn.termination_reason;
    if (input.delegation_count !== null) turn.delegation_count = input.delegation_count;
    if (input.points !== null) turn.points = input.points;
    turn.finished_at = new Date().toISOString();
  }
  async listByConversation(workspaceId: string, conversationId: string): Promise<SquadTurnEntity[]> {
    return [...this.rows.values()]
      .filter((t) => t.workspace_id === workspaceId && t.conversation_id === conversationId)
      .map((t) => structuredClone(t));
  }
  async listBySquad(
    workspaceId: string,
    squadId: string,
    filter: { user_id?: string; limit: number },
  ): Promise<SquadTurnEntity[]> {
    return [...this.rows.values()]
      .filter((t) => t.workspace_id === workspaceId && t.squad_id === squadId && (!filter.user_id || t.user_id === filter.user_id))
      .slice(0, filter.limit)
      .map((t) => structuredClone(t));
  }
}
