import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { EntitlementService } from '@/server/domain/entitlements/entitlements';
import {
  ForbiddenError,
  NotFoundError,
  UpstreamServiceError,
  UpstreamUnavailableError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import type { WorkspaceMemberEntity } from '@/server/domain/entities/user';
import {
  canEditSquad,
  canOpenSquad,
  computeAttention,
  turnCeilingPoints,
  type SquadAttention,
  type SquadEntity,
  type SquadRosterEntry,
} from '@/server/domain/squads/squad';
import type { SquadRepository, SquadSpecialistDirectory } from '@/server/domain/squads/squad_ports';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';

export interface SquadDeps {
  squads: SquadRepository;
  directory: SquadSpecialistDirectory;
  audit: AuditLogger;
  entitlements: EntitlementService;
  transactions: TransactionRunner;
  /** Only the lookup the access override needs. */
  members: { findMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberEntity | null> };
}

/** A squad as a screen needs it: the stored squad plus what is computed for this person right now. */
export interface SquadDescription {
  squad: SquadEntity;
  /** Null when the roster could not be read: the screen says it could not check. */
  attention: SquadAttention[] | null;
  my_access: 'open' | 'ask_admin';
  can_edit: boolean;
  /** "Up to N points" for a lead-routed turn. */
  ceiling_points: number;
}

export function requireWorkspace(context: RequestContext): string {
  if (!context.workspace_id) {
    throw new ValidationError('Workspace context is required', [
      { code: 'required', field: 'workspace_id', detail: 'Workspace context is required' },
    ]);
  }
  return context.workspace_id;
}

export function isOwnerOrAdmin(context: RequestContext): boolean {
  return context.role === 'owner' || context.role === 'admin';
}

/** Missing and another workspace's squad give the same 404. */
export async function loadSquad(deps: Pick<SquadDeps, 'squads'>, context: RequestContext, squadId: string): Promise<SquadEntity> {
  const squad = await deps.squads.findById(requireWorkspace(context), squadId);
  if (!squad) throw new NotFoundError('Squad', squadId);
  return squad;
}

/**
 * The roster for a read: sineva-ai down or off-contract gives null, which the
 * screens show as "could not check". Writes call the directory directly and
 * fail instead, because creating a squad from an invented roster is worse
 * than not creating it (ADR-0008).
 */
export async function readRoster(
  directory: SquadSpecialistDirectory,
  context: RequestContext,
): Promise<SquadRosterEntry[] | null> {
  try {
    return await directory.roster(context);
  } catch (error) {
    if (error instanceof UpstreamUnavailableError || error instanceof UpstreamServiceError) return null;
    throw error;
  }
}

export async function describeSquad(
  deps: Pick<SquadDeps, 'squads'>,
  squad: SquadEntity,
  context: RequestContext,
  roster: SquadRosterEntry[] | null,
): Promise<SquadDescription> {
  const overridden = await deps.squads.hasAccessOverride(squad.id, context.user_id);
  return {
    squad,
    attention: computeAttention(squad, roster),
    my_access: canOpenSquad(squad, context, overridden) ? 'open' : 'ask_admin',
    can_edit: canEditSquad(context.role, context.user_id, squad),
    ceiling_points: turnCeilingPoints(squad),
  };
}

export function assertCanEdit(squad: SquadEntity, context: RequestContext): void {
  if (!canEditSquad(context.role, context.user_id, squad)) {
    throw new ForbiddenError('You can only change squads you created');
  }
}

export function assertNotArchived(squad: SquadEntity): void {
  if (squad.status === 'archived') {
    throw new ValidationError('Archived squads are read-only', [
      { code: 'squad_archived', field: 'status', detail: 'Archived squads are read-only' },
    ]);
  }
}

/** The person may open this squad, by their own specialist access or an override. */
export async function assertCanOpen(
  deps: Pick<SquadDeps, 'squads'>,
  squad: SquadEntity,
  context: RequestContext,
): Promise<void> {
  const overridden = await deps.squads.hasAccessOverride(squad.id, context.user_id);
  if (!canOpenSquad(squad, context, overridden)) {
    throw new ForbiddenError('Ask an admin for access to this squad');
  }
}
