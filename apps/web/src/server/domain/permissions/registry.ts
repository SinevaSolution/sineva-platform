import type { UserRole } from '@/server/domain/entities/user';

export type PermissionKey =
  | 'workspace.view'
  | 'workspace.update'
  | 'workspace.delete'
  | 'workspace.transfer_ownership'
  | 'member.view'
  | 'member.view_contact'
  | 'member.invite'
  | 'member.update_role'
  | 'member.update_access'
  | 'member.remove'
  | 'specialist.view'
  | 'specialist.use'
  | 'specialist.enable'
  | 'specialist.configure'
  | 'specialist.preferences'
  | 'chat.read'
  | 'chat.create'
  | 'chat.delete'
  | 'chat.send'
  | 'chat.view_own'
  | 'storage.upload'
  | 'storage.read'
  | 'storage.delete'
  | 'audit.view'
  | 'billing.view'
  | 'billing.manage'
  | 'profile.view'
  | 'profile.update'
  | 'preferences.manage_own'
  | 'model.view'
  | 'model.manage'
  | 'model.manage_keys'
  | 'inbox.view'
  | 'approval.decide_own'
  | 'approval.decide_any'
  | 'inbox.answer';

export type PermissionAccess = 'yes' | 'no' | 'limited';

export interface PermissionDefinition {
  key: PermissionKey;
  area:
    | 'workspace'
    | 'member'
    | 'specialist'
    | 'chat'
    | 'storage'
    | 'audit'
    | 'billing'
    | 'profile'
    | 'model'
    | 'inbox';
  description: string;
  roles: Record<UserRole, PermissionAccess>;
}

export const C2_PERMISSION_MATRIX_FIXTURE: Record<
  PermissionKey,
  Record<UserRole, PermissionAccess>
> = {
  'workspace.view': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'workspace.update': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'workspace.delete': { owner: 'yes', admin: 'no', member: 'no', viewer: 'no' },
  'workspace.transfer_ownership': { owner: 'yes', admin: 'no', member: 'no', viewer: 'no' },
  'member.view': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'member.view_contact': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'member.invite': { owner: 'yes', admin: 'limited', member: 'no', viewer: 'no' },
  'member.update_role': { owner: 'yes', admin: 'limited', member: 'no', viewer: 'no' },
  'member.update_access': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'member.remove': { owner: 'yes', admin: 'limited', member: 'no', viewer: 'no' },
  'specialist.view': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'specialist.use': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'specialist.enable': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'specialist.configure': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'specialist.preferences': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'chat.read': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'chat.create': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'chat.delete': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'chat.send': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'chat.view_own': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'storage.upload': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'storage.read': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'storage.delete': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'audit.view': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'billing.view': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'billing.manage': { owner: 'yes', admin: 'no', member: 'no', viewer: 'no' },
  'profile.view': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'profile.update': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'preferences.manage_own': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  'model.view': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'model.manage': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'model.manage_keys': { owner: 'yes', admin: 'no', member: 'no', viewer: 'no' },
  // Viewer opens the Inbox but the use cases show only Done summaries without draft bodies.
  'inbox.view': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'yes' },
  // Member decides only items addressed to them; the use case checks the recipient.
  'approval.decide_own': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
  'approval.decide_any': { owner: 'yes', admin: 'yes', member: 'no', viewer: 'no' },
  'inbox.answer': { owner: 'yes', admin: 'yes', member: 'yes', viewer: 'no' },
};

export const CANONICAL_PERMISSION_KEYS = Object.keys(
  C2_PERMISSION_MATRIX_FIXTURE,
) as PermissionKey[];

export interface PolicyContext {
  actorUserId: string;
  targetUserId?: string;
  actorRole: UserRole;
  targetRole?: UserRole;
  specialistSlug?: string;
  allowedSpecialists?: string[];
}

export type PermissionPolicy = (context: PolicyContext) => boolean;

export const PERMISSION_POLICIES: Partial<Record<PermissionKey, PermissionPolicy>> = {
  'member.invite': ({ actorRole, targetRole }) => {
    // Admins cannot invite an owner
    if (actorRole === 'admin' && targetRole === 'owner') return false;
    return true;
  },
  'member.update_role': ({ actorRole, targetRole, actorUserId, targetUserId }) => {
    // Cannot change own role
    if (actorUserId === targetUserId) return false;
    // Admins cannot promote to owner or alter an owner's role
    if (actorRole === 'admin' && (targetRole === 'owner')) return false;
    return true;
  },
  'member.remove': ({ actorRole, targetRole, actorUserId, targetUserId }) => {
    // Cannot remove self via member.remove (use member.leave instead)
    if (actorUserId === targetUserId) return false;
    // Admins cannot remove an owner
    if (actorRole === 'admin' && targetRole === 'owner') return false;
    return true;
  },
  'specialist.use': ({ allowedSpecialists, specialistSlug }) => {
    // If scoped to selected specialists, check membership
    if (allowedSpecialists && specialistSlug) {
      return allowedSpecialists.includes(specialistSlug);
    }
    return true;
  },
};

export interface PermissionDecision {
  allowed: boolean;
  isLimited: boolean;
  reason?: string;
}

export function hasPermission(
  role: UserRole,
  permission: PermissionKey,
  context?: PolicyContext,
): PermissionDecision {
  const mapping = C2_PERMISSION_MATRIX_FIXTURE[permission];
  if (!mapping) {
    return { allowed: false, isLimited: false, reason: `Unknown permission: ${permission}` };
  }

  const access = mapping[role];
  if (access === 'no') {
    return { allowed: false, isLimited: false, reason: `Role ${role} does not have ${permission}` };
  }

  if (access === 'yes') {
    return { allowed: true, isLimited: false };
  }

  // Limited access: evaluate policy if defined
  const policy = PERMISSION_POLICIES[permission];
  if (policy && context) {
    const policyResult = policy(context);
    return {
      allowed: policyResult,
      isLimited: true,
      reason: policyResult ? undefined : `Policy check failed for ${permission}`,
    };
  }

  // Without context, default to allowed for limited if role has partial access
  return { allowed: true, isLimited: true };
}
