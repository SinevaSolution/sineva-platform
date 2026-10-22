import { beforeEach, describe, expect, it } from 'vitest';
import { OWNERSHIP_TRANSFER_TTL_MS } from '@/server/domain/members/invitation';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/domain_error';
import { OwnershipTransferStateError } from '@/server/domain/members/member_errors';
import { buildMemberUseCases } from './fakes/members_use_cases';
import { MembersWorld, seededWorld, USERS, WS } from './fakes/members_world';

describe('ownership transfer (WP-M1-28, FR-AUTH-14, US-AUTH-10)', () => {
  let world: MembersWorld;
  let uc: ReturnType<typeof buildMemberUseCases>;

  beforeEach(() => {
    world = seededWorld();
    uc = buildMemberUseCases(world);
  });

  const ownerCtx = () => world.ctx(USERS.owner, 'owner');
  const adminMember = () => world.memberOf(WS, USERS.admin)!;
  const targetCtx = () => world.ctx(USERS.admin, 'admin', '');

  async function request() {
    return uc.requestTransfer.execute({ context: ownerCtx(), target_member_id: adminMember().id });
  }

  describe('requesting', () => {
    it('emails the target a link, stores only the digest and audits the request', async () => {
      await request();
      const token = world.lastLinkToken();
      expect(world.emails.getLastEmail()).toMatchObject({ to: 'admin@acme.test', template: 'ownership_transfer_request' });
      expect(world.emails.getLastEmail()!.params.url).toBe(`https://app.sineva.test/ownership/${token}`);
      expect(world.storedTokenHashes()).toEqual([world.tokens.hash(token)]);
      expect(world.actions()).toEqual(['workspace.ownership_transfer_requested']);
      // Nothing changes before the target confirms.
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('owner');
    });

    it('only the owner can start it', async () => {
      await expect(
        uc.requestTransfer.execute({ context: world.ctx(USERS.admin, 'admin'), target_member_id: adminMember().id }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('the target must be an existing admin', async () => {
      for (const user of [USERS.member, USERS.viewer, USERS.owner]) {
        await expect(
          uc.requestTransfer.execute({ context: ownerCtx(), target_member_id: world.memberOf(WS, user)!.id }),
        ).rejects.toBeInstanceOf(ValidationError);
      }
      expect(world.state.transfers).toHaveLength(0);
    });

    it('a second request replaces the first: one open transfer, the old link dies', async () => {
      await request();
      const first = world.lastLinkToken();
      await request();
      const second = world.lastLinkToken();
      expect(world.state.transfers.filter((t) => !t.cancelled_at && !t.accepted_at)).toHaveLength(1);
      await expect(
        uc.acceptTransfer.execute({ token: first, context: targetCtx() }),
      ).rejects.toMatchObject({ code: 'ownership_transfer_cancelled' });
      await uc.acceptTransfer.execute({ token: second, context: targetCtx() });
      expect(world.memberOf(WS, USERS.admin)!.role).toBe('owner');
    });

    it('a failed email rolls the request back so no unreachable transfer stays open', async () => {
      const { DependencyUnavailableError } = await import('@/server/domain/errors/domain_error');
      world.emails = { send: async () => { throw new DependencyUnavailableError(); } } as never;
      uc = buildMemberUseCases(world);
      await expect(request()).rejects.toBeInstanceOf(DependencyUnavailableError);
      expect(world.state.transfers).toHaveLength(0);
      expect(world.actions()).toEqual([]);
    });

    it('the owner can read and cancel the pending transfer', async () => {
      await request();
      const pending = await uc.getTransfer.execute({ context: ownerCtx() });
      expect(pending).toMatchObject({ state: 'pending', target: { display_name: 'Adi Admin' } });
      const token = world.lastLinkToken();
      await uc.cancelTransfer.execute({ context: ownerCtx() });
      expect(await uc.getTransfer.execute({ context: ownerCtx() })).toBeNull();
      expect(world.actions()).toContain('workspace.ownership_transfer_cancelled');
      await expect(uc.acceptTransfer.execute({ token, context: targetCtx() })).rejects.toBeInstanceOf(OwnershipTransferStateError);
    });
  });

  describe('previewing', () => {
    it('shows workspace, previous owner first name and whether the viewer is the target', async () => {
      await request();
      const token = world.lastLinkToken();
      expect(await uc.previewTransfer.execute({ token, viewer_user_id: USERS.admin })).toMatchObject({
        state: 'pending',
        workspace_name: 'Warung Sari',
        from_first_name: 'Sari',
        is_target: true,
      });
      expect((await uc.previewTransfer.execute({ token, viewer_user_id: USERS.member })).is_target).toBe(false);
      expect((await uc.previewTransfer.execute({ token })).is_target).toBeNull();
    });
  });

  describe('accepting', () => {
    it('swaps the roles atomically: target owner, previous owner admin, exactly one owner', async () => {
      await request();
      const result = await uc.acceptTransfer.execute({ token: world.lastLinkToken(), context: targetCtx() });

      expect(world.memberOf(WS, USERS.admin)!.role).toBe('owner');
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('admin');
      expect(world.ownerCount(WS)).toBe(1);
      expect(world.state.workspaces.get(WS)!.owner_user_id).toBe(USERS.admin);
      expect(world.actions()).toContain('workspace.ownership_transferred');
      expect(result.workspace.id).toBe(WS);
    });

    it('notifies both parties by email', async () => {
      await request();
      const token = world.lastLinkToken();
      world.emails.clear();
      await uc.acceptTransfer.execute({ token, context: targetCtx() });
      const sent = world.emails.getSentEmails();
      expect(sent.map((e) => [e.to, e.template, e.params.new_role]).sort()).toEqual([
        ['admin@acme.test', 'ownership_transferred_notice', 'owner'],
        ['owner@acme.test', 'ownership_transferred_notice', 'admin'],
      ]);
    });

    it('is single use', async () => {
      await request();
      const token = world.lastLinkToken();
      await uc.acceptTransfer.execute({ token, context: targetCtx() });
      await expect(uc.acceptTransfer.execute({ token, context: targetCtx() })).rejects.toMatchObject({
        code: 'ownership_transfer_used',
      });
    });

    it('only the target account can accept', async () => {
      await request();
      await expect(
        uc.acceptTransfer.execute({ token: world.lastLinkToken(), context: world.ctx(USERS.member, 'member', '') }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('owner');
    });

    it('expires after 7 days (fake clock)', async () => {
      await request();
      const token = world.lastLinkToken();
      world.advance(OWNERSHIP_TRANSFER_TTL_MS);
      await expect(uc.acceptTransfer.execute({ token, context: targetCtx() })).rejects.toMatchObject({
        code: 'ownership_transfer_expired',
      });
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('owner');
    });

    it('fails without changing anything when the target is no longer an admin', async () => {
      await request();
      const token = world.lastLinkToken();
      world.memberOf(WS, USERS.admin)!.role = 'member';
      await expect(uc.acceptTransfer.execute({ token, context: targetCtx() })).rejects.toMatchObject({
        code: 'ownership_transfer_stale',
      });
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('owner');
      expect(world.ownerCount(WS)).toBe(1);
      expect(world.state.transfers[0]!.accepted_at).toBeNull();
    });

    it('stays atomic when the audit write fails: nobody changes role', async () => {
      await request();
      const token = world.lastLinkToken();
      world.failAuditAfter = world.state.audit.length;
      await expect(uc.acceptTransfer.execute({ token, context: targetCtx() })).rejects.toThrow('audit write failed');
      expect(world.memberOf(WS, USERS.owner)!.role).toBe('owner');
      expect(world.memberOf(WS, USERS.admin)!.role).toBe('admin');
      expect(world.state.transfers[0]!.accepted_at).toBeNull();
    });

    it('under concurrency exactly one of two accepts wins and one owner remains', async () => {
      await request();
      const token = world.lastLinkToken();
      const results = await Promise.allSettled([
        uc.acceptTransfer.execute({ token, context: targetCtx() }),
        uc.acceptTransfer.execute({ token, context: targetCtx() }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(world.ownerCount(WS)).toBe(1);
      expect(world.memberOf(WS, USERS.admin)!.role).toBe('owner');
    });
  });

  it('the previous owner can leave once they are an admin (the workspace is never orphaned)', async () => {
    await request();
    await uc.acceptTransfer.execute({ token: world.lastLinkToken(), context: targetCtx() });
    await uc.leave.execute({ context: world.ctx(USERS.owner, 'admin') });
    expect(world.ownerCount(WS)).toBe(1);
  });
});
