import {
  squadDoneExtrasSchema,
  squadHandoffEventSchema,
  squadHandoffResultEventSchema,
  squadTurnLimitEventSchema,
} from '@/server/application/dtos/squad_dto';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RunRelayLog } from '@/server/domain/chat/run_relay_log';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import {
  boundsFor,
  buildSquadClaim,
  canOpenSquad,
  leadSlugOf,
  memberSlugs,
  turnCeilingPoints,
} from '@/server/domain/squads/squad';
import type {
  MemberToolPolicy,
  SquadRepository,
  SquadTerminationReason,
  SquadTurnPlan,
  SquadTurnPort,
  SquadTurnRepository,
} from '@/server/domain/squads/squad_ports';

export interface SquadTurnServiceDeps {
  squads: SquadRepository;
  turns: SquadTurnRepository;
  tools: MemberToolPolicy;
  audit: AuditLogger;
  log: RunRelayLog;
}

const REASONS: ReadonlySet<string> = new Set<SquadTerminationReason>([
  'done',
  'cap_delegations',
  'cap_tokens',
  'cap_time',
  'cap_credits',
  'error',
  'cancelled',
]);

/**
 * What the run relay asks of squads (ADR-0044). It re-checks the squad and the
 * caller when the stream starts (the squad may have changed since the message
 * was stored), builds the claim from stored data only, and keeps the turn and
 * its handoffs in step with the events.
 */
export class SquadTurnService implements SquadTurnPort {
  constructor(private readonly deps: SquadTurnServiceDeps) {}

  async prepare(input: {
    conversation: ConversationEntity;
    run_handle: string;
    agent_slug: string;
    context: RequestContext;
  }): Promise<SquadTurnPlan> {
    const { conversation, context } = input;
    const squadId = conversation.squad_id;
    const squad = squadId ? await this.deps.squads.findById(conversation.workspace_id, squadId) : null;
    if (!squad || conversation.kind !== 'squad') throw new NotFoundError('Squad', squadId ?? 'none');
    if (squad.status === 'archived') {
      throw new ValidationError('Archived squads are read-only', [
        { code: 'squad_archived', field: 'squad_id', detail: 'Archived squads are read-only' },
      ]);
    }
    const overridden = await this.deps.squads.hasAccessOverride(squad.id, context.user_id);
    if (!canOpenSquad(squad, context, overridden)) {
      throw new ForbiddenError('Ask an admin for access to this squad');
    }

    // Effective tools per member: the policy owns the intersection of the
    // allowlist, the person's permissions and their connections. The goal text
    // is never an input to it.
    const toolsBySlug: Record<string, string[]> = {};
    for (const slug of memberSlugs(squad)) {
      toolsBySlug[slug] = await this.deps.tools.allowedTools({ agent_slug: slug, context });
    }
    const claim = buildSquadClaim(squad, toolsBySlug);

    const lead = leadSlugOf(squad);
    const direct = input.agent_slug !== lead && memberSlugs(squad).includes(input.agent_slug) ? input.agent_slug : null;
    await this.deps.turns.start({
      workspace_id: conversation.workspace_id,
      squad_id: squad.id,
      conversation_id: conversation.id,
      user_id: context.user_id,
      run_handle: input.run_handle,
      lead_slug: lead,
      direct_slug: direct,
      // A direct @SinoX is estimated like a Room turn, so it shows no ceiling (FR-BILL-05).
      ceiling_points: direct ? null : turnCeilingPoints(squad),
    });

    const bounds = boundsFor(squad);
    return { squad_id: squad.id, claim, budget: { max_credits: bounds.max_credits, max_tokens: bounds.max_tokens } };
  }

  async recordFrame(input: { run_handle: string; event: string; data: unknown; context: RequestContext }): Promise<void> {
    const turn = await this.deps.turns.findByRunHandle(input.run_handle);
    if (!turn) return;
    if (input.event === 'handoff') {
      const parsed = squadHandoffEventSchema.safeParse(input.data);
      if (!parsed.success) return this.drop(input.run_handle);
      const e = parsed.data;
      await this.deps.turns.recordHandoff(turn.id, {
        delegation_id: e.delegation_id,
        from_slug: e.from,
        to_slug: e.to,
        task_summary: e.task_summary,
        parallel_group: e.parallel_group ?? null,
      });
    } else if (input.event === 'handoff_result') {
      const parsed = squadHandoffResultEventSchema.safeParse(input.data);
      if (!parsed.success) return this.drop(input.run_handle);
      const e = parsed.data;
      await this.deps.turns.recordHandoffResult(turn.id, {
        delegation_id: e.delegation_id,
        status: e.status,
        summary: e.summary ?? null,
        error_code: e.error_code ?? null,
        points: e.points ?? null,
      });
    } else if (input.event === 'turn_limit') {
      const parsed = squadTurnLimitEventSchema.safeParse(input.data);
      if (!parsed.success) return this.drop(input.run_handle);
      await this.deps.turns.recordLimit(turn.id, parsed.data.cap);
      // Written once per turn: a replay of the same frame does not log it again.
      if (turn.termination_reason !== parsed.data.cap) {
        await this.deps.audit.log({
          action: 'squad.turn.limit_reached',
          context: input.context,
          target_resource_type: 'squad',
          target_resource_id: turn.squad_id,
          workspace_id: turn.workspace_id,
          metadata: { cap: parsed.data.cap, run_handle: input.run_handle },
        });
      }
    }
  }

  async finish(input: {
    run_handle: string;
    outcome: 'completed' | 'failed' | 'cancelled';
    squad: { termination_reason?: string; delegation_count?: number; points?: number } | null;
  }): Promise<void> {
    const turn = await this.deps.turns.findByRunHandle(input.run_handle);
    if (!turn) return;
    const extras = input.squad ? squadDoneExtrasSchema.safeParse(input.squad) : null;
    const given = extras?.success ? extras.data.termination_reason : undefined;
    const reason: SquadTerminationReason | null =
      given && REASONS.has(given)
        ? (given as SquadTerminationReason)
        : input.outcome === 'failed'
          ? 'error'
          : input.outcome === 'cancelled'
            ? 'cancelled'
            : turn.termination_reason
              ? null // a turn_limit event already stored the cap
              : 'done';
    await this.deps.turns.finish(turn.id, {
      status: input.outcome,
      termination_reason: reason,
      delegation_count: extras?.success ? (extras.data.delegation_count ?? null) : null,
      points: extras?.success ? (extras.data.points ?? null) : null,
    });
  }

  private drop(runHandle: string): void {
    this.deps.log.failed('squad_frame_failed', { run_handle: runHandle });
  }
}
