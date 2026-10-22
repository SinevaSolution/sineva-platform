import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { LastOwnerError } from '@/server/domain/members/member_errors';
import { buildMemberUseCases } from './fakes/members_use_cases';
import { MembersWorld, OTHER_WS, seededWorld, USERS, WS } from './fakes/members_world';

describe('member management (WP-M1-28, FR-AUTH-14, FR-AUTH-18, FR-AUTH-19, FR-AUTH-21)', () => {
  let world: MembersWorld;
  let uc: ReturnType<typeof buildMemberUseCases>;

  beforeEach(() => {
    world = seededWorld();
    uc = buildMemberUseCases(world);
  });

  const ownerCtx = () => world.ctx(USERS.owner, 'owner');
  const adminCtx = () => world.ctx(USERS.admin, 'admin');
  const idOf = (userId: string) => world.memberOf(WS, userId)!.id;

  describe('listing (contact fields need member.view_contact)', () => {
    it('gives owners and admins email, scope and last active', async () => {
      for (const ctx of [ownerCtx(), adminCtx()]) {
        const list = await uc.listMembers.execute({ context: ctx });
        const member = list.find((m) => m.id === idOf(USERS.member))!;
        expect(member).toMatchObject({
          email: 'member@acme.test',
          specialist_scope: 'all',
          role: 'member',
          status: 'active',
        });
        expect('last_active_at' in member).toBe(true);
      }
    });

    it('hides every contact field from members and viewers but keeps names and roles', async () => {
      for (const [user, role] of [[USERS.member, 'member'], [USERS.viewer, 'viewer']] as const) {
        const list = await uc.listMembers.execute({ context: world.ctx(user, role) });
        expect(list).toHaveLength(4);
        const json = JSON.stringify(list);
        expect(json).not.toContain('@acme.test');
        expect(json).not.toContain('phone');
        expect(json).not.toContain('last_active_at');
        expect(json).not.toContain('specialist_scope');
        expect(list.find((m) => m.is_you)?.id).toBe(idOf(user));
        expect(list.every((m) => m.display_name && m.role)).toBe(true);
      }
    });

    it('never lists another workspace members', async () => {
      world.addWorkspace(OTHER_WS, null);
      world.addUser('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'x@other.test');
      world.addMember(OTHER_WS, 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'owner');
      const list = await uc.listMembers.execute({ context: ownerCtx() });
      expect(JSON.stringify(list)).not.toContain('x@other.test');
    });

    it('a member id of another workspace is a 404', async () => {
      world.addWorkspace(OTHER_WS, null);
      world.addUser('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'x@other.test');
      const foreign = world.addMember(OTHER_WS, 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'member');
      await expect(uc.getMember.execute({ context: ownerCtx(), member_id: foreign.id })).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        uc.update.execute({ context: ownerCtx(), member_id: foreign.id, role: 'viewer' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(uc.remove.execute({ context: ownerCtx(), member_id: foreign.id })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('role changes', () => {
    it('owner promotes and demotes admins; the change is audited with before and after', async () => {
      await uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.member), role: 'admin' });
      expect(world.memberOf(WS, USERS.member)!.role).toBe('admin');
      await uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.admin), role: 'viewer' });
      expect(world.memberOf(WS, USERS.admin)!.role).toBe('viewer');

      const events = world.state.audit.filter((e) => e.action === 'member.role_changed');
      expect(events).toHaveLength(2);
      expect(events[0]!.change).toEqual({ before: { role: 'member' }, after: { role: 'admin' } });
    });

    it('an admin cannot change another admin, promote to admin, or touch the owner', async () => {
      world.addUser('aaaaaaaa-aaaa-4aaa-8aaa-000000000005', 'admin2@acme.test');
      const admin2 = world.addMember(WS, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005', 'admin');
      await expect(uc.update.execute({ context: adminCtx(), member_id: admin2.id, role: 'member' })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(uc.update.execute({ context: adminCtx(), member_id: idOf(USERS.member), role: 'admin' })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(uc.update.execute({ context: adminCtx(), member_id: idOf(USERS.owner), role: 'member' })).rejects.toBeInstanceOf(ForbiddenError);
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('owner');
    });

    it('an admin moves a member to viewer', async () => {
      await uc.update.execute({ context: adminCtx(), member_id: idOf(USERS.member), role: 'viewer' });
      expect(world.memberOf(WS, USERS.member)!.role).toBe('viewer');
    });

    it('the owner cannot be demoted, not even by themselves, and nobody becomes owner by patch', async () => {
      await expect(
        uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.owner), role: 'admin' }),
      ).rejects.toBeInstanceOf(LastOwnerError);
      await expect(
        uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.admin), role: 'owner' as never }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(world.ownerCount(WS)).toBe(1);
    });

    it('members and viewers cannot change roles', async () => {
      await expect(
        uc.update.execute({ context: world.ctx(USERS.member, 'member'), member_id: idOf(USERS.viewer), role: 'member' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('re-reads the actor role under the lock: a demoted admin cannot finish an action', async () => {
      const ctx = adminCtx();
      world.memberOf(WS, USERS.admin)!.role = 'member';
      await expect(uc.update.execute({ context: ctx, member_id: idOf(USERS.viewer), role: 'member' })).rejects.toBeInstanceOf(ForbiddenError);
      expect(world.locks).toBeGreaterThan(0);
    });

    it('leaving the member role resets the scope to all and clears the allowlist', async () => {
      await uc.setSpecialists.execute({ context: ownerCtx(), member_id: idOf(USERS.member), specialist_slugs: ['sinopeople'] });
      await uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.member), role: 'viewer' });
      const member = world.memberOf(WS, USERS.member)!;
      expect(member.specialist_scope).toBe('all');
      expect(world.state.allowlists.has(member.id)).toBe(false);
    });

    it('a role change that drops mcp.use revokes grants; one that keeps it does not', async () => {
      await uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.admin), role: 'member' });
      expect(world.state.mcp).toEqual([]);
      await uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.member), role: 'viewer' });
      expect(world.state.mcp).toEqual([{ workspace_id: WS, user_id: USERS.member, reason: 'role_changed' }]);
    });

    it('a failed audit write rolls the role change back', async () => {
      world.failAuditAfter = 0;
      await expect(
        uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.member), role: 'viewer' }),
      ).rejects.toThrow('audit write failed');
      expect(world.memberOf(WS, USERS.member)!.role).toBe('member');
    });
  });

  describe('specialist scope (FR-AUTH-19)', () => {
    it('PUT sets a selected allowlist from the manifest slugs and audits it', async () => {
      await uc.setSpecialists.execute({
        context: ownerCtx(),
        member_id: idOf(USERS.member),
        specialist_slugs: ['sinofinance', 'sinosales'],
      });
      const member = world.memberOf(WS, USERS.member)!;
      expect(member.specialist_scope).toBe('selected');
      expect(world.state.allowlists.get(member.id)).toEqual(['sinofinance', 'sinosales']);
      expect(world.actions()).toContain('member.specialist_access_changed');
    });

    it('deduplicates the allowlist', async () => {
      await uc.setSpecialists.execute({
        context: ownerCtx(),
        member_id: idOf(USERS.member),
        specialist_slugs: ['sinofinance', 'sinofinance'],
      });
      expect(world.state.allowlists.get(idOf(USERS.member))).toEqual(['sinofinance']);
    });

    it('rejects unknown slugs and an empty allowlist', async () => {
      await expect(
        uc.setSpecialists.execute({ context: ownerCtx(), member_id: idOf(USERS.member), specialist_slugs: ['sino-finance'] }),
      ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'unknown_specialist' })] });
      await expect(
        uc.setSpecialists.execute({ context: ownerCtx(), member_id: idOf(USERS.member), specialist_slugs: [] }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('PATCH scope all clears the allowlist; selected without any slugs is rejected', async () => {
      await uc.setSpecialists.execute({ context: ownerCtx(), member_id: idOf(USERS.member), specialist_slugs: ['sinopeople'] });
      await uc.update.execute({ context: ownerCtx(), member_id: idOf(USERS.member), specialist_scope: 'all' });
      const member = world.memberOf(WS, USERS.member)!;
      expect(member.specialist_scope).toBe('all');
      expect(world.state.allowlists.has(member.id)).toBe(false);
      await expect(
        uc.update.execute({ context: ownerCtx(), member_id: member.id, specialist_scope: 'selected' }),
      ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'allowlist_required' })] });
    });

    it('does not apply to viewers, admins or the owner', async () => {
      for (const user of [USERS.viewer, USERS.admin, USERS.owner]) {
        await expect(
          uc.setSpecialists.execute({ context: ownerCtx(), member_id: idOf(user), specialist_slugs: ['sinopeople'] }),
        ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'scope_not_applicable' })] });
      }
    });

    it('members and viewers cannot set access', async () => {
      await expect(
        uc.setSpecialists.execute({ context: world.ctx(USERS.member, 'member'), member_id: idOf(USERS.member), specialist_slugs: ['sinopeople'] }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('an admin may set a member scope', async () => {
      await uc.setSpecialists.execute({ context: adminCtx(), member_id: idOf(USERS.member), specialist_slugs: ['sinopeople'] });
      expect(world.memberOf(WS, USERS.member)!.specialist_scope).toBe('selected');
    });
  });

  describe('removal (FR-AUTH-18)', () => {
    it('deletes the membership, revokes workspace sessions immediately and audits', async () => {
      const active = world.addSession(USERS.member, WS);
      const otherWorkspaceSession = world.addSession(USERS.member, OTHER_WS);
      await uc.remove.execute({ context: ownerCtx(), member_id: idOf(USERS.member) });

      expect(world.memberOf(WS, USERS.member)).toBeUndefined();
      expect(world.state.sessions.find((s) => s.id === active)!.revoked_at).not.toBeNull();
      expect(world.state.sessions.find((s) => s.id === otherWorkspaceSession)!.revoked_at).toBeNull();
      expect(world.actions()).toContain('member.removed');
      expect(world.state.mcp).toEqual([{ workspace_id: WS, user_id: USERS.member, reason: 'member_removed' }]);
    });

    it('keeps the removed person authored content attributed to a Former member', async () => {
      await uc.remove.execute({ context: ownerCtx(), member_id: idOf(USERS.member) });
      // The account row stays (content references the user id), only the membership is gone.
      expect(world.state.users.has(USERS.member)).toBe(true);
    });

    it('admins cannot remove the owner or other admins; they can remove members', async () => {
      await expect(uc.remove.execute({ context: adminCtx(), member_id: idOf(USERS.owner) })).rejects.toBeInstanceOf(ForbiddenError);
      world.addUser('aaaaaaaa-aaaa-4aaa-8aaa-000000000005', 'admin2@acme.test');
      const admin2 = world.addMember(WS, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005', 'admin');
      await expect(uc.remove.execute({ context: adminCtx(), member_id: admin2.id })).rejects.toBeInstanceOf(ForbiddenError);
      await uc.remove.execute({ context: adminCtx(), member_id: idOf(USERS.viewer) });
      expect(world.memberOf(WS, USERS.viewer)).toBeUndefined();
    });

    it('the last owner cannot be removed, not even by themselves', async () => {
      await expect(uc.remove.execute({ context: ownerCtx(), member_id: idOf(USERS.owner) })).rejects.toBeInstanceOf(LastOwnerError);
      expect(world.ownerCount(WS)).toBe(1);
    });

    it('rolls back when the audit write fails: the person keeps access', async () => {
      const session = world.addSession(USERS.member, WS);
      world.failAuditAfter = 0;
      await expect(uc.remove.execute({ context: ownerCtx(), member_id: idOf(USERS.member) })).rejects.toThrow('audit write failed');
      expect(world.memberOf(WS, USERS.member)).toBeDefined();
      expect(world.state.sessions.find((s) => s.id === session)!.revoked_at).toBeNull();
      expect(world.state.mcp).toEqual([]);
    });
  });

  describe('leaving (FR-AUTH-36 leave part)', () => {
    it('a member leaves without touching anyone else', async () => {
      const before = world.state.members.length;
      const session = world.addSession(USERS.member, WS);
      await uc.leave.execute({ context: world.ctx(USERS.member, 'member') });
      expect(world.state.members).toHaveLength(before - 1);
      expect(world.memberOf(WS, USERS.admin)).toBeDefined();
      expect(world.state.sessions.find((s) => s.id === session)!.revoked_at).not.toBeNull();
      expect(world.actions()).toEqual(['member.left']);
    });

    it('the last owner cannot leave (test required by the Y7 gate)', async () => {
      await expect(uc.leave.execute({ context: ownerCtx() })).rejects.toBeInstanceOf(LastOwnerError);
      expect(world.ownerCount(WS)).toBe(1);
      expect(world.actions()).toEqual([]);
    });

    it('an admin may leave', async () => {
      await uc.leave.execute({ context: adminCtx() });
      expect(world.memberOf(WS, USERS.admin)).toBeUndefined();
    });
  });
});
