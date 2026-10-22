import { beforeEach, describe, expect, it } from 'vitest';
import { INVITATION_TTL_MS } from '@/server/domain/members/invitation';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/domain_error';
import { ENTITLEMENT_KEYS } from '@/server/domain/entitlements/entitlements';
import {
  AlreadyMemberError,
  EmailNotVerifiedError,
  InvitationEmailMismatchError,
  InvitationNotFoundError,
  InvitationStateError,
} from '@/server/domain/members/member_errors';
import { buildMemberUseCases } from './fakes/members_use_cases';
import { MembersWorld, seededWorld, USERS, WS } from './fakes/members_world';

const NEW_EMAIL = 'newbie@acme.test';

describe('invitations (WP-M1-28, FR-AUTH-16, FR-AUTH-17)', () => {
  let world: MembersWorld;
  let uc: ReturnType<typeof buildMemberUseCases>;

  beforeEach(() => {
    world = seededWorld();
    uc = buildMemberUseCases(world);
  });

  const ownerCtx = () => world.ctx(USERS.owner, 'owner');
  const adminCtx = () => world.ctx(USERS.admin, 'admin');

  async function invite(email = NEW_EMAIL, role: 'admin' | 'member' | 'viewer' = 'member') {
    return uc.invite.execute({ context: ownerCtx(), email, role });
  }

  describe('creating', () => {
    it('stores only a SHA-256 digest and puts the plain token in the emailed link only', async () => {
      const result = await invite();
      const token = world.lastLinkToken();

      expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
      expect(result.invite_url).toBe(`https://app.sineva.test/invite/${token}`);
      const stored = world.storedTokenHashes();
      expect(stored).toEqual([world.tokens.hash(token)]);
      expect(stored).not.toContain(token);
      // The digest is neither in the returned entity nor in the audit payload.
      expect(JSON.stringify(result.invitation)).not.toContain(world.tokens.hash(token));
      expect(JSON.stringify(world.state.audit)).not.toContain(token);
      expect(JSON.stringify(world.state.audit)).not.toContain(NEW_EMAIL);
    });

    it('generates distinct 256-bit tokens', () => {
      const a = world.tokens.generate();
      const b = world.tokens.generate();
      expect(a.token).not.toBe(b.token);
      expect(Buffer.from(a.token, 'base64url')).toHaveLength(32);
    });

    it('expires after 7 days and emails the workspace name, inviter and role', async () => {
      const result = await invite(NEW_EMAIL, 'viewer');
      const expiry = new Date(result.invitation.expires_at).getTime();
      expect(expiry - world.now.getTime()).toBe(INVITATION_TTL_MS);
      expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);

      const mail = world.emails.getLastEmail();
      expect(mail?.to).toBe(NEW_EMAIL);
      expect(mail?.template).toBe('workspace_invitation');
      expect(mail?.params).toMatchObject({ workspace_name: 'Warung Sari', role: 'viewer' });
      expect(result.email_sent).toBe(true);
    });

    it('audits member.invited with ids only and calls the members entitlement', async () => {
      await invite();
      expect(world.actions()).toEqual(['member.invited']);
      expect(world.entitlementChecks).toEqual([ENTITLEMENT_KEYS.MEMBERS]);
    });

    it('lowercases and trims the address', async () => {
      const result = await uc.invite.execute({ context: ownerCtx(), email: '  NewBie@ACME.test ', role: 'member' });
      expect(result.invitation.email).toBe(NEW_EMAIL);
    });

    it('shows "Already in this workspace" for an existing member (FR-AUTH-17)', async () => {
      await expect(invite('member@acme.test')).rejects.toBeInstanceOf(AlreadyMemberError);
      await expect(invite('MEMBER@acme.test')).rejects.toMatchObject({ code: 'already_member', status: 409 });
      expect(world.state.invitations).toHaveLength(0);
    });

    it('still reports a failed delivery instead of hiding it, and keeps the invitation', async () => {
      const failing = {
        send: async () => {
          const { DependencyUnavailableError } = await import('@/server/domain/errors/domain_error');
          throw new DependencyUnavailableError();
        },
      };
      const failingUc = buildMemberUseCases(Object.assign(world, { emails: failing as never }));
      const result = await failingUc.invite.execute({ context: ownerCtx(), email: NEW_EMAIL, role: 'member' });
      expect(result.email_sent).toBe(false);
      expect(world.state.invitations).toHaveLength(1);
    });
  });

  describe('role limits', () => {
    it('refuses to invite an owner, even as the owner', async () => {
      await expect(
        uc.invite.execute({ context: ownerCtx(), email: NEW_EMAIL, role: 'owner' as never }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('lets the owner invite admins', async () => {
      const result = await invite(NEW_EMAIL, 'admin');
      expect(result.invitation.role).toBe('admin');
    });

    it('refuses admin invites by an admin (admin invites need the owner)', async () => {
      await expect(
        uc.invite.execute({ context: adminCtx(), email: NEW_EMAIL, role: 'admin' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(world.state.invitations).toHaveLength(0);
    });

    it('lets an admin invite members and viewers', async () => {
      await uc.invite.execute({ context: adminCtx(), email: NEW_EMAIL, role: 'member' });
      await uc.invite.execute({ context: adminCtx(), email: 'v@acme.test', role: 'viewer' });
      expect(world.state.invitations).toHaveLength(2);
    });

    it('refuses invites by members and viewers', async () => {
      for (const [user, role] of [[USERS.member, 'member'], [USERS.viewer, 'viewer']] as const) {
        await expect(
          uc.invite.execute({ context: world.ctx(user, role), email: NEW_EMAIL, role: 'viewer' }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
    });
  });

  describe('specialist scope on an invitation (FR-AUTH-19)', () => {
    it('keeps a selected allowlist for members', async () => {
      const result = await uc.invite.execute({
        context: ownerCtx(),
        email: NEW_EMAIL,
        role: 'member',
        specialist_scope: 'selected',
        specialist_slugs: ['sinofinance'],
      });
      expect(result.invitation).toMatchObject({ specialist_scope: 'selected', specialist_slugs: ['sinofinance'] });
    });

    it('rejects selected without slugs, unknown slugs and scope for non-members', async () => {
      await expect(
        uc.invite.execute({ context: ownerCtx(), email: NEW_EMAIL, role: 'member', specialist_scope: 'selected', specialist_slugs: [] }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        uc.invite.execute({ context: ownerCtx(), email: NEW_EMAIL, role: 'member', specialist_scope: 'selected', specialist_slugs: ['sino-nope'] }),
      ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'unknown_specialist' })] });
      await expect(
        uc.invite.execute({ context: ownerCtx(), email: NEW_EMAIL, role: 'viewer', specialist_scope: 'selected', specialist_slugs: ['sinofinance'] }),
      ).rejects.toMatchObject({ details: [expect.objectContaining({ code: 'scope_not_applicable' })] });
    });
  });

  describe('re-inviting and resending (FR-AUTH-17)', () => {
    it('replaces the pending invitation: one row, the old link dies, the new one works', async () => {
      await invite();
      const oldToken = world.lastLinkToken();
      const second = await uc.invite.execute({ context: ownerCtx(), email: NEW_EMAIL, role: 'viewer' });
      const newToken = world.lastLinkToken();

      expect(second.replaced).toBe(true);
      expect(world.state.invitations).toHaveLength(1);
      expect(newToken).not.toBe(oldToken);
      await expect(uc.previewInvitation.execute({ token: oldToken })).rejects.toBeInstanceOf(InvitationNotFoundError);
      expect((await uc.previewInvitation.execute({ token: newToken })).role).toBe('viewer');
    });

    it('resend issues a fresh token and a fresh 7 days, and audits it', async () => {
      const first = await invite();
      const oldToken = world.lastLinkToken();
      world.advance(3 * 24 * 60 * 60 * 1000);

      const resent = await uc.resend.execute({ context: ownerCtx(), invitation_id: first.invitation.id });
      const newToken = world.lastLinkToken();

      expect(newToken).not.toBe(oldToken);
      expect(new Date(resent.invitation.expires_at).getTime() - world.now.getTime()).toBe(INVITATION_TTL_MS);
      await expect(uc.previewInvitation.execute({ token: oldToken })).rejects.toBeInstanceOf(InvitationNotFoundError);
      expect(world.actions()).toEqual(['member.invited', 'member.invited']);
    });

    it('an admin cannot resend or revoke an admin invitation', async () => {
      const created = await invite(NEW_EMAIL, 'admin');
      await expect(uc.resend.execute({ context: adminCtx(), invitation_id: created.invitation.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(uc.revoke.execute({ context: adminCtx(), invitation_id: created.invitation.id })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('listing and revoking (FR-AUTH-17)', () => {
    it('lists pending invitations with their expiry and marks lapsed ones expired', async () => {
      await invite();
      await invite('later@acme.test');
      world.state.invitations[0]!.expires_at = new Date(world.now.getTime() - 1000).toISOString();

      const list = await uc.listInvitations.execute({ context: ownerCtx() });
      expect(list.map((i) => [i.email, i.state])).toEqual([
        [NEW_EMAIL, 'expired'],
        ['later@acme.test', 'pending'],
      ]);
      expect(JSON.stringify(list)).not.toMatch(/token/i);
    });

    it('revoking kills the link and audits invitation.revoked', async () => {
      const created = await invite();
      const token = world.lastLinkToken();
      await uc.revoke.execute({ context: ownerCtx(), invitation_id: created.invitation.id });

      expect(world.actions()).toContain('invitation.revoked');
      await expect(
        uc.acceptInvitation.execute({ token, context: world.ctx(USERS.stranger, 'member') }),
      ).rejects.toBeInstanceOf(InvitationStateError);
      expect(await uc.listInvitations.execute({ context: ownerCtx() })).toEqual([]);
    });

    it('revoking an unknown invitation is a 404', async () => {
      await expect(
        uc.revoke.execute({ context: ownerCtx(), invitation_id: '99999999-9999-4999-8999-999999999999' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('preview (FR-AUTH-16)', () => {
    it('shows the workspace, the inviter first name and role, never any email', async () => {
      await invite();
      const preview = await uc.previewInvitation.execute({ token: world.lastLinkToken() });
      expect(preview).toMatchObject({
        state: 'pending',
        workspace_name: 'Warung Sari',
        inviter_first_name: 'Sari',
        role: 'member',
      });
      const json = JSON.stringify(preview);
      expect(json).not.toContain(NEW_EMAIL);
      expect(json).not.toContain('owner@acme.test');
      expect(json).not.toContain('Wulandari');
    });

    it('reports the expired state from the clock', async () => {
      await invite();
      const token = world.lastLinkToken();
      world.advance(INVITATION_TTL_MS + 1000);
      expect((await uc.previewInvitation.execute({ token })).state).toBe('expired');
    });

    it('tells a signed-in viewer only whether their own email matches', async () => {
      world.addUser(USERS.stranger, NEW_EMAIL);
      await invite();
      const token = world.lastLinkToken();
      expect((await uc.previewInvitation.execute({ token, viewer_user_id: USERS.stranger })).email_matches_session).toBe(true);
      expect((await uc.previewInvitation.execute({ token, viewer_user_id: USERS.member })).email_matches_session).toBe(false);
      expect((await uc.previewInvitation.execute({ token })).email_matches_session).toBeNull();
    });

    it('treats an unknown token as not found', async () => {
      await expect(uc.previewInvitation.execute({ token: 'nope' })).rejects.toBeInstanceOf(InvitationNotFoundError);
    });
  });

  describe('accepting (FR-AUTH-16)', () => {
    const accepter = USERS.stranger;
    beforeEach(() => {
      world.addUser(accepter, NEW_EMAIL);
    });

    it('adds the member with the invited role and scope, audits and calls the entitlement', async () => {
      await uc.invite.execute({
        context: ownerCtx(),
        email: NEW_EMAIL,
        role: 'member',
        specialist_scope: 'selected',
        specialist_slugs: ['sinosales'],
      });
      world.entitlementChecks.length = 0;
      const result = await uc.acceptInvitation.execute({
        token: world.lastLinkToken(),
        context: world.ctx(accepter, 'member', ''),
      });

      expect(result.workspace).toMatchObject({ id: WS, workspace_name: 'Warung Sari' });
      const member = world.memberOf(WS, accepter);
      expect(member).toMatchObject({ role: 'member', specialist_scope: 'selected' });
      expect(world.state.allowlists.get(member!.id)).toEqual(['sinosales']);
      expect(world.actions()).toContain('invitation.accepted');
      expect(world.entitlementChecks).toEqual([ENTITLEMENT_KEYS.MEMBERS]);
    });

    it('is single use: a replay is refused and adds nothing', async () => {
      await invite();
      const token = world.lastLinkToken();
      await uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') });
      const members = world.state.members.length;

      await expect(
        uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') }),
      ).rejects.toMatchObject({ code: 'invitation_used' });
      expect(world.state.members).toHaveLength(members);
    });

    it('refuses another signed-in account: a forwarded link is useless (wrong-account test)', async () => {
      await invite();
      const token = world.lastLinkToken();
      await expect(
        uc.acceptInvitation.execute({ token, context: world.ctx(USERS.viewer, 'viewer', '') }),
      ).rejects.toBeInstanceOf(InvitationEmailMismatchError);
      expect(world.memberOf(WS, USERS.viewer)?.role).toBe('viewer');
      expect(world.state.invitations[0]!.accepted_at).toBeNull();
      // The rightful account can still accept afterwards.
      await uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') });
      expect(world.memberOf(WS, accepter)).toBeDefined();
    });

    it('refuses a matching but unverified account', async () => {
      world.state.users.get(accepter)!.email_verified = false;
      await invite();
      await expect(
        uc.acceptInvitation.execute({ token: world.lastLinkToken(), context: world.ctx(accepter, 'member', '') }),
      ).rejects.toBeInstanceOf(EmailNotVerifiedError);
    });

    it('matches the email case-insensitively', async () => {
      world.state.users.get(accepter)!.email = 'NewBie@Acme.Test';
      await invite();
      await uc.acceptInvitation.execute({ token: world.lastLinkToken(), context: world.ctx(accepter, 'member', '') });
      expect(world.memberOf(WS, accepter)).toBeDefined();
    });

    it('still accepts one millisecond before the 7 day expiry (fake clock)', async () => {
      await invite();
      const token = world.lastLinkToken();
      world.advance(INVITATION_TTL_MS - 1);
      await uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') });
      expect(world.memberOf(WS, accepter)).toBeDefined();
    });

    it('rejects at exactly 7 days and audits the expiry only on the first attempt', async () => {
      await invite();
      const token = world.lastLinkToken();
      world.advance(INVITATION_TTL_MS);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(
          uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') }),
        ).rejects.toMatchObject({ code: 'invitation_expired' });
      }
      expect(world.actions().filter((a) => a === 'invitation.expired')).toHaveLength(1);
      expect(world.memberOf(WS, accepter)).toBeUndefined();
    });

    it('answers 409 already_member when the account joined another way and consumes nothing', async () => {
      await invite();
      world.addMember(WS, accepter, 'viewer');
      await expect(
        uc.acceptInvitation.execute({ token: world.lastLinkToken(), context: world.ctx(accepter, 'viewer', '') }),
      ).rejects.toBeInstanceOf(AlreadyMemberError);
    });

    it('two concurrent accepts add exactly one membership', async () => {
      await invite();
      const token = world.lastLinkToken();
      const results = await Promise.allSettled([
        uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') }),
        uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(world.state.members.filter((m) => m.user_id === accepter)).toHaveLength(1);
    });

    it('a failed audit write rolls the membership back (one transaction)', async () => {
      await invite();
      const token = world.lastLinkToken();
      world.failAuditAfter = world.state.audit.length;
      await expect(
        uc.acceptInvitation.execute({ token, context: world.ctx(accepter, 'member', '') }),
      ).rejects.toThrow('audit write failed');
      expect(world.memberOf(WS, accepter)).toBeUndefined();
      expect(world.state.invitations[0]!.accepted_at).toBeNull();
    });
  });
});
