import type { UserRole } from '@/server/domain/entities/user';

// Pure rules for who may do what to whom inside one workspace (FR-AUTH-14,
// FR-AUTH-16, FR-AUTH-18). Kept apart from the permission registry's yes/no
// matrix because the "limited" cells of that matrix depend on both parties'
// roles, and the use cases need the same answers the registry gives.

/** Roles an invitation can carry. `owner` is reached only through an ownership transfer. */
export const INVITABLE_ROLES: readonly UserRole[] = ['admin', 'member', 'viewer'];

/** Roles a PATCH can set. Same set: nobody becomes owner by editing a role. */
export const ASSIGNABLE_ROLES: readonly UserRole[] = INVITABLE_ROLES;

const ADMIN_MANAGEABLE: readonly UserRole[] = ['member', 'viewer'];

/** Owner invites admin, member or viewer; an admin invites member or viewer (admin invites need the owner). */
export function canInviteRole(actorRole: UserRole, inviteRole: UserRole): boolean {
  if (actorRole === 'owner') return INVITABLE_ROLES.includes(inviteRole);
  if (actorRole === 'admin') return ADMIN_MANAGEABLE.includes(inviteRole);
  return false;
}

/**
 * Role change. Never one's own, never the owner's (the owner moves by transfer,
 * which also keeps exactly one owner), never to `owner`. An admin can only move
 * members and viewers between those two roles; only the owner promotes or
 * demotes admins.
 */
export function canChangeRole(
  actorRole: UserRole,
  targetRole: UserRole,
  newRole: UserRole,
  isSelf: boolean,
): boolean {
  if (isSelf) return false;
  if (targetRole === 'owner' || !ASSIGNABLE_ROLES.includes(newRole)) return false;
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') {
    return ADMIN_MANAGEABLE.includes(targetRole) && ADMIN_MANAGEABLE.includes(newRole);
  }
  return false;
}

/** Removal of someone else. The owner is never removable; admins cannot remove other admins. */
export function canRemoveMember(actorRole: UserRole, targetRole: UserRole, isSelf: boolean): boolean {
  if (isSelf || targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return ADMIN_MANAGEABLE.includes(targetRole);
  return false;
}

/** Specialist scope exists for members only: viewers have no chat access, admins and the owner see everything. */
export function scopeApplies(role: UserRole): boolean {
  return role === 'member';
}

/**
 * Whether a role holds `mcp.use`. The MCP permission keys land with the MCP
 * server; until then this mirrors the plan (viewers cannot act through an
 * external AI tool) so the revocation hook already fires on the right changes.
 */
export function roleHasMcpUse(role: UserRole): boolean {
  return role !== 'viewer';
}
