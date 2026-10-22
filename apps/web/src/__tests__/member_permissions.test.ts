import { describe, expect, it } from 'vitest';
import { hasPermission } from '@/server/domain/permissions/registry';
import {
  canChangeRole,
  canInviteRole,
  canRemoveMember,
  roleHasMcpUse,
  scopeApplies,
} from '@/server/domain/members/member_policy';
import type { UserRole } from '@/server/domain/entities/user';

const ROLES: UserRole[] = ['owner', 'admin', 'member', 'viewer'];

// FR-AUTH-16, FR-AUTH-18: the registry's "limited" cells and the pure policy
// functions must give the same answer, otherwise a route guard and a use case
// would disagree.
describe('member.invite policy (FR-AUTH-16)', () => {
  it('owner invites admin, member and viewer, never owner', () => {
    for (const role of ['admin', 'member', 'viewer'] as const) {
      expect(hasPermission('owner', 'member.invite', { actorUserId: 'a', actorRole: 'owner', targetRole: role }).allowed).toBe(true);
    }
    expect(hasPermission('owner', 'member.invite', { actorUserId: 'a', actorRole: 'owner', targetRole: 'owner' }).allowed).toBe(false);
  });

  it('admin invites at or below member level only: admin invites need the owner', () => {
    const ctx = (targetRole: UserRole) => ({ actorUserId: 'a', actorRole: 'admin' as const, targetRole });
    expect(hasPermission('admin', 'member.invite', ctx('member')).allowed).toBe(true);
    expect(hasPermission('admin', 'member.invite', ctx('viewer')).allowed).toBe(true);
    expect(hasPermission('admin', 'member.invite', ctx('admin')).allowed).toBe(false);
    expect(hasPermission('admin', 'member.invite', ctx('owner')).allowed).toBe(false);
  });

  it('member and viewer never invite', () => {
    for (const actor of ['member', 'viewer'] as const) {
      expect(canInviteRole(actor, 'viewer')).toBe(false);
    }
  });
});

describe('member.update_role policy (FR-AUTH-14, FR-AUTH-18)', () => {
  const ask = (actorRole: UserRole, targetRole: UserRole, newRole: UserRole, self = false) =>
    hasPermission(actorRole, 'member.update_role', {
      actorUserId: 'actor',
      targetUserId: self ? 'actor' : 'target',
      actorRole,
      targetRole,
      newRole,
    }).allowed;

  it('only the owner promotes or demotes admins', () => {
    expect(ask('owner', 'admin', 'member')).toBe(true);
    expect(ask('owner', 'member', 'admin')).toBe(true);
    expect(ask('admin', 'admin', 'member')).toBe(false);
    expect(ask('admin', 'member', 'admin')).toBe(false);
  });

  it('an admin moves members and viewers between those two roles', () => {
    expect(ask('admin', 'member', 'viewer')).toBe(true);
    expect(ask('admin', 'viewer', 'member')).toBe(true);
  });

  it('nobody changes the owner role or sets owner by role change', () => {
    for (const actor of ['owner', 'admin'] as const) {
      expect(ask(actor, 'owner', 'admin')).toBe(false);
      expect(ask(actor, 'member', 'owner')).toBe(false);
    }
  });

  it('nobody changes their own role', () => {
    expect(ask('owner', 'owner', 'admin', true)).toBe(false);
    expect(ask('admin', 'admin', 'member', true)).toBe(false);
  });

  it('pure and registry answers agree for every role combination', () => {
    for (const actor of ROLES) {
      for (const target of ROLES) {
        for (const next of ROLES) {
          const registry =
            actor === 'member' || actor === 'viewer'
              ? false
              : ask(actor, target, next);
          expect(registry, `${actor} ${target}->${next}`).toBe(canChangeRole(actor, target, next, false));
        }
      }
    }
  });
});

describe('member.remove policy (FR-AUTH-18)', () => {
  const ask = (actorRole: UserRole, targetRole: UserRole, self = false) =>
    hasPermission(actorRole, 'member.remove', {
      actorUserId: 'actor',
      targetUserId: self ? 'actor' : 'target',
      actorRole,
      targetRole,
    }).allowed;

  it('admins cannot remove the owner or other admins', () => {
    expect(ask('admin', 'owner')).toBe(false);
    expect(ask('admin', 'admin')).toBe(false);
    expect(ask('admin', 'member')).toBe(true);
    expect(ask('admin', 'viewer')).toBe(true);
  });

  it('the owner removes admins, members and viewers but never themselves', () => {
    expect(ask('owner', 'admin')).toBe(true);
    expect(ask('owner', 'member')).toBe(true);
    expect(ask('owner', 'owner', true)).toBe(false);
  });

  it('agrees with the pure function', () => {
    for (const target of ROLES) {
      expect(ask('admin', target)).toBe(canRemoveMember('admin', target, false));
    }
  });
});

describe('scope and mcp helpers', () => {
  it('scope applies to members only (viewers have no chat access)', () => {
    expect(scopeApplies('member')).toBe(true);
    expect(scopeApplies('viewer')).toBe(false);
    expect(scopeApplies('admin')).toBe(false);
    expect(scopeApplies('owner')).toBe(false);
  });

  it('viewer is the role without mcp.use', () => {
    expect(roleHasMcpUse('viewer')).toBe(false);
    expect(roleHasMcpUse('member')).toBe(true);
  });
});
