import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { AcceptInvitationUseCase } from '@/server/application/use-cases/members/accept_invitation_use_case';
import { AcceptOwnershipTransferUseCase } from '@/server/application/use-cases/members/accept_ownership_transfer_use_case';
import { InviteMemberUseCase } from '@/server/application/use-cases/members/invite_member_use_case';
import { RemoveMemberUseCase } from '@/server/application/use-cases/members/remove_member_use_case';
import { RequestOwnershipTransferUseCase } from '@/server/application/use-cases/members/request_ownership_transfer_use_case';
import { UpdateMemberUseCase } from '@/server/application/use-cases/members/update_member_use_case';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { INVITATION_TTL_MS } from '@/server/domain/members/invitation';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaAuditRepository } from '@/server/infrastructure/database/prisma_audit_repository';
import { PrismaInvitationRepository } from '@/server/infrastructure/database/prisma_invitation_repository';
import { PrismaMemberAccountLookup } from '@/server/infrastructure/database/prisma_member_account_lookup';
import { PrismaMemberSessionRevoker } from '@/server/infrastructure/database/prisma_member_session_revoker';
import { PrismaOwnershipTransferRepository } from '@/server/infrastructure/database/prisma_ownership_transfer_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaWorkspaceMemberRepository } from '@/server/infrastructure/database/prisma_workspace_member_repository';
import { PrismaWorkspaceRepository } from '@/server/infrastructure/database/prisma_workspace_repository';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { renderEmailTemplate } from '@/server/application/email/templates';
import { NoopMcpGrantRevoker } from '@/server/infrastructure/security/noop_mcp_grant_revoker';
import { Sha256LinkTokenService } from '@/server/infrastructure/security/sha256_link_token_service';
import { ModeEntitlementService } from '@/server/application/entitlements/mode_entitlement_service';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const members = new PrismaWorkspaceMemberRepository(prisma);
const invitations = new PrismaInvitationRepository(prisma);
const transfers = new PrismaOwnershipTransferRepository(prisma);
const accounts = new PrismaMemberAccountLookup(prisma);
const workspaces = new PrismaWorkspaceRepository(prisma);
const sessions = new PrismaMemberSessionRevoker(prisma);
const transactions = new PrismaTransactionRunner(prisma);
const audit = new RepositoryAuditLogger(new PrismaAuditRepository(prisma));
const tokens = new Sha256LinkTokenService();
const entitlements = new ModeEntitlementService('open', { resolve: async () => null }, () => undefined);
const KNOWN = ['sinopeople', 'sinofinance', 'sinosales'];
const APP_URL = 'https://app.sineva.test';

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let seq = 0;
async function user(email?: string, verified = true) {
  seq += 1;
  return prisma.user.create({
    data: {
      email: email ?? `user${seq}-${Date.now()}@acme.test`,
      full_name: `Person ${seq}`,
      email_verified: verified,
      locale: 'en',
    },
  });
}

async function workspaceWith(roles: UserRole[]) {
  const owner = await user();
  const ws = await prisma.workspace.create({
    data: { workspace_slug: `ws-${seq}-${Date.now()}`, workspace_name: 'Warung Sari', owner_user_id: owner.id },
  });
  const people = [{ user: owner, role: 'owner' as UserRole }];
  await members.addMember(ws.id, { user_id: owner.id, role: 'owner' });
  for (const role of roles) {
    const u = await user();
    await members.addMember(ws.id, { user_id: u.id, role });
    people.push({ user: u, role });
  }
  return { ws, owner, people };
}

const ctx = (userId: string, role: UserRole, workspaceId?: string): RequestContext => ({
  user_id: userId,
  workspace_id: workspaceId,
  role,
  session_id: 's',
  request_id: 'req-int-0001',
  actor: { type: 'user', id: userId },
});

describe('schema invariants (FR-AUTH-14, FR-AUTH-16)', () => {
  it('allows exactly one owner per workspace (partial unique index)', async () => {
    const { ws } = await workspaceWith([]);
    const second = await user();
    await expect(members.addMember(ws.id, { user_id: second.id, role: 'owner' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows one open invitation per workspace and address, case-insensitively, until it is revoked', async () => {
    const { ws, owner } = await workspaceWith([]);
    const base = {
      workspace_id: ws.id,
      inviter_user_id: owner.id,
      role: 'member',
      expires_at: new Date(Date.now() + 1000),
    };
    await prisma.workspaceInvitation.create({ data: { ...base, email: 'a@acme.test', token_hash: 'h1' } });
    await expect(
      prisma.workspaceInvitation.create({ data: { ...base, email: 'A@Acme.Test', token_hash: 'h2' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.workspaceInvitation.updateMany({ where: { token_hash: 'h1' }, data: { revoked_at: new Date() } });
    await prisma.workspaceInvitation.create({ data: { ...base, email: 'a@acme.test', token_hash: 'h3' } });
  });

  it('allows one open ownership transfer per workspace', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const base = {
      workspace_id: ws.id,
      from_user_id: owner.id,
      to_user_id: people[1]!.user.id,
      expires_at: new Date(Date.now() + 1000),
    };
    await prisma.ownershipTransfer.create({ data: { ...base, token_hash: 't1' } });
    await expect(prisma.ownershipTransfer.create({ data: { ...base, token_hash: 't2' } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});

describe('PrismaWorkspaceMemberRepository (ADR-0029)', () => {
  it('joins the surrounding transaction: a failure after a write leaves the role unchanged', async () => {
    const { ws, people } = await workspaceWith(['member']);
    const member = await members.findMembership(ws.id, people[1]!.user.id);
    await expect(
      transactions.run(async () => {
        await members.updateRole(ws.id, member!.id, 'admin');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await members.findMembership(ws.id, people[1]!.user.id))!.role).toBe('member');
  });

  it('keeps ids scoped to the workspace', async () => {
    const a = await workspaceWith(['member']);
    const b = await workspaceWith(['member']);
    const foreign = await members.findMembership(b.ws.id, b.people[1]!.user.id);
    expect(await members.findById(a.ws.id, foreign!.id)).toBeNull();
    expect(await members.getDirectoryEntry(a.ws.id, foreign!.id)).toBeNull();
    await expect(members.removeMember(a.ws.id, foreign!.id)).rejects.toMatchObject({ status: 404 });
    expect(await members.findById(b.ws.id, foreign!.id)).not.toBeNull();
  });

  it('replaces the allowlist, lists it sorted, and removes it with the member', async () => {
    const { ws, people } = await workspaceWith(['member']);
    const member = (await members.findMembership(ws.id, people[1]!.user.id))!;
    await members.updateAccess(ws.id, member.id, { specialist_scope: 'selected', specialist_slugs: ['sinosales', 'sinopeople'] });
    await members.updateAccess(ws.id, member.id, { specialist_scope: 'selected', specialist_slugs: ['sinofinance', 'sinopeople'] });

    const entry = (await members.getDirectoryEntry(ws.id, member.id))!;
    expect(entry.member.specialist_scope).toBe('selected');
    expect(entry.specialist_slugs).toEqual(['sinofinance', 'sinopeople']);

    await members.updateAccess(ws.id, member.id, { specialist_scope: 'all', specialist_slugs: [] });
    expect(await prisma.workspaceMemberSpecialist.count({ where: { workspace_member_id: member.id } })).toBe(0);

    await members.updateAccess(ws.id, member.id, { specialist_scope: 'selected', specialist_slugs: ['sinopeople'] });
    await members.removeMember(ws.id, member.id);
    expect(await prisma.workspaceMemberSpecialist.count({ where: { workspace_member_id: member.id } })).toBe(0);
  });

  it('lists the directory with contact fields and the latest sign-in', async () => {
    const { ws, people } = await workspaceWith(['admin']);
    await prisma.session.create({
      data: {
        user_id: people[1]!.user.id,
        token: `tok-${seq}-${Date.now()}`,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });
    const list = await members.listDirectory(ws.id);
    const admin = list.find((e) => e.member.user_id === people[1]!.user.id)!;
    expect(admin.user.email).toBe(people[1]!.user.email);
    expect(admin.user.last_active_at).not.toBeNull();
    expect(list.find((e) => e.member.role === 'owner')!.user.last_active_at).toBeNull();
  });

  it('swapOwner swaps both roles and workspaces.owner_user_id, and refuses a stale pair without changes', async () => {
    const { ws, owner, people } = await workspaceWith(['admin', 'member']);
    const admin = people[1]!.user;
    const plain = people[2]!.user;

    expect(await members.swapOwner(ws.id, owner.id, plain.id)).toBe(false);
    expect((await members.findMembership(ws.id, owner.id))!.role).toBe('owner');

    expect(await members.swapOwner(ws.id, owner.id, admin.id)).toBe(true);
    expect((await members.findMembership(ws.id, owner.id))!.role).toBe('admin');
    expect((await members.findMembership(ws.id, admin.id))!.role).toBe('owner');
    expect((await prisma.workspace.findUnique({ where: { id: ws.id } }))!.owner_user_id).toBe(admin.id);
    expect(await prisma.workspaceMember.count({ where: { workspace_id: ws.id, role: 'owner' } })).toBe(1);
  });

  it('lockWorkspace serializes concurrent ownership swaps: exactly one wins and one owner remains', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const admin = people[1]!.user;
    const attempt = () =>
      transactions.run(async () => {
        await members.lockWorkspace(ws.id);
        return members.swapOwner(ws.id, owner.id, admin.id);
      });
    const results = await Promise.all([attempt(), attempt(), attempt()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.workspaceMember.count({ where: { workspace_id: ws.id, role: 'owner' } })).toBe(1);
    expect((await members.findMembership(ws.id, admin.id))!.role).toBe('owner');
  });

  it('lockWorkspace on an unknown workspace is a 404', async () => {
    await expect(
      transactions.run(() => members.lockWorkspace('99999999-9999-4999-8999-999999999999')),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('PrismaInvitationRepository (FR-AUTH-16, FR-AUTH-17)', () => {
  const input = (inviter: string, hash: string, email = 'new@acme.test') => ({
    email,
    role: 'member' as const,
    inviter_user_id: inviter,
    specialist_scope: 'selected' as const,
    specialist_slugs: ['sinopeople'],
    token_hash: hash,
    expires_at: new Date(Date.now() + INVITATION_TTL_MS),
    sent_at: new Date(),
  });

  it('stores only the digest, replaces the pending row in place and kills the old link', async () => {
    const { ws, owner } = await workspaceWith([]);
    const first = tokens.generate();
    const created = await invitations.upsertPending(ws.id, input(owner.id, first.hash));
    expect(created.replaced).toBe(false);

    const raw = await prisma.workspaceInvitation.findMany({ where: { workspace_id: ws.id } });
    expect(raw).toHaveLength(1);
    expect(raw[0]!.token_hash).toBe(first.hash);
    expect(raw[0]!.token_hash).not.toBe(first.token);
    expect(raw[0]!.scope_agent_slugs).toEqual(['sinopeople']);

    const second = tokens.generate();
    const replaced = await invitations.upsertPending(ws.id, input(owner.id, second.hash, 'NEW@acme.test'));
    expect(replaced.replaced).toBe(true);
    expect(replaced.invitation.id).toBe(created.invitation.id);
    expect(await prisma.workspaceInvitation.count({ where: { workspace_id: ws.id } })).toBe(1);
    expect(await invitations.findByTokenHash(first.hash)).toBeNull();
    expect((await invitations.findByTokenHash(second.hash))!.id).toBe(created.invitation.id);
  });

  it('never returns the digest on the entity', async () => {
    const { ws, owner } = await workspaceWith([]);
    const t = tokens.generate();
    const { invitation } = await invitations.upsertPending(ws.id, input(owner.id, t.hash));
    expect(JSON.stringify(invitation)).not.toContain(t.hash);
  });

  it('claimAcceptance is single use under concurrency', async () => {
    const { ws, owner } = await workspaceWith([]);
    const { invitation } = await invitations.upsertPending(ws.id, input(owner.id, tokens.generate().hash));
    const claims = await Promise.all(Array.from({ length: 5 }, () => invitations.claimAcceptance(invitation.id, new Date())));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('revoke, listOpen and the once-only expiry flag', async () => {
    const { ws, owner } = await workspaceWith([]);
    const a = await invitations.upsertPending(ws.id, input(owner.id, tokens.generate().hash, 'a@acme.test'));
    await invitations.upsertPending(ws.id, input(owner.id, tokens.generate().hash, 'b@acme.test'));
    expect((await invitations.listOpen(ws.id)).map((i) => i.email)).toEqual(['a@acme.test', 'b@acme.test']);

    expect(await invitations.revoke(ws.id, a.invitation.id, new Date())).toBe(true);
    expect(await invitations.revoke(ws.id, a.invitation.id, new Date())).toBe(false);
    expect((await invitations.listOpen(ws.id)).map((i) => i.email)).toEqual(['b@acme.test']);

    const open = (await invitations.listOpen(ws.id))[0]!;
    expect(await invitations.markExpiredLogged(open.id, new Date())).toBe(true);
    expect(await invitations.markExpiredLogged(open.id, new Date())).toBe(false);
  });

  it('keeps invitations scoped to the workspace', async () => {
    const a = await workspaceWith([]);
    const b = await workspaceWith([]);
    const { invitation } = await invitations.upsertPending(b.ws.id, input(b.owner.id, tokens.generate().hash));
    expect(await invitations.findById(a.ws.id, invitation.id)).toBeNull();
    expect(await invitations.revoke(a.ws.id, invitation.id, new Date())).toBe(false);
    expect(await invitations.listOpen(a.ws.id)).toEqual([]);
  });
});

describe('PrismaOwnershipTransferRepository (FR-AUTH-14)', () => {
  it('replaces an open transfer, keeps one open row and single-use claims', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const to = people[1]!.user.id;
    const base = { from_user_id: owner.id, to_user_id: to, expires_at: new Date(Date.now() + INVITATION_TTL_MS) };
    const first = tokens.generate();
    const a = await transfers.createPending(ws.id, { ...base, token_hash: first.hash });
    expect(a.replaced_transfer_id).toBeNull();
    const second = tokens.generate();
    const b = await transfers.createPending(ws.id, { ...base, token_hash: second.hash });
    expect(b.replaced_transfer_id).toBe(a.transfer.id);

    expect((await transfers.findOpen(ws.id))!.id).toBe(b.transfer.id);
    expect((await transfers.findByTokenHash(first.hash))!.cancelled_at).not.toBeNull();
    expect(JSON.stringify(b.transfer)).not.toContain(second.hash);

    const claims = await Promise.all([transfers.claim(b.transfer.id, new Date()), transfers.claim(b.transfer.id, new Date())]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await transfers.findOpen(ws.id)).toBeNull();
  });
});

describe('PrismaMemberSessionRevoker', () => {
  it('revokes only sessions pinned to that workspace for that user', async () => {
    const a = await workspaceWith(['member']);
    const b = await workspaceWith([]);
    const person = a.people[1]!.user;
    const mk = (active: string | null) =>
      prisma.session.create({
        data: {
          user_id: person.id,
          token: `t-${Math.random()}`,
          active_workspace_id: active,
          expires_at: new Date(Date.now() + 86_400_000),
        },
      });
    const pinned = await mk(a.ws.id);
    const other = await mk(b.ws.id);
    const unpinned = await mk(null);

    expect(await sessions.revokeForWorkspace(person.id, a.ws.id)).toBe(1);
    const state = async (id: string) => (await prisma.session.findUnique({ where: { id } }))!.revoked_at;
    expect(await state(pinned.id)).not.toBeNull();
    expect(await state(other.id)).toBeNull();
    expect(await state(unpinned.id)).toBeNull();
  });
});

describe('flows on the real adapters', () => {
  function useCases() {
    const email = new FakeEmailSender(renderEmailTemplate);
    const base = { members, audit, transactions, clock: () => new Date(), knownSpecialistSlugs: KNOWN };
    return {
      email,
      invite: new InviteMemberUseCase({
        ...base,
        invitations,
        accounts,
        workspaces,
        tokens,
        email,
        entitlements,
        appUrl: APP_URL,
      }),
      accept: new AcceptInvitationUseCase({ ...base, invitations, accounts, workspaces, tokens, entitlements }),
      update: new UpdateMemberUseCase({ ...base, mcp: new NoopMcpGrantRevoker() }),
      remove: new RemoveMemberUseCase({ ...base, sessions, mcp: new NoopMcpGrantRevoker() }),
      requestTransfer: new RequestOwnershipTransferUseCase({
        ...base,
        transfers,
        accounts,
        workspaces,
        tokens,
        email,
        appUrl: APP_URL,
      }),
      acceptTransfer: new AcceptOwnershipTransferUseCase({ ...base, transfers, accounts, workspaces, tokens, email }),
    };
  }

  it('invite, accept: the member, the allowlist and both audit rows land together; a replay is refused', async () => {
    const { ws, owner } = await workspaceWith([]);
    const invitee = await user('invitee@acme.test');
    const uc = useCases();

    await uc.invite.execute({
      context: ctx(owner.id, 'owner', ws.id),
      email: 'Invitee@Acme.test',
      role: 'member',
      specialist_scope: 'selected',
      specialist_slugs: ['sinofinance'],
    });
    const token = String(uc.email.getLastEmail()!.params.url).split('/').pop()!;

    const accepted = await uc.accept.execute({ token, context: ctx(invitee.id, 'member') });
    expect(accepted.role).toBe('member');
    const membership = (await members.getDirectoryEntry(ws.id, (await members.findMembership(ws.id, invitee.id))!.id))!;
    expect(membership.specialist_slugs).toEqual(['sinofinance']);

    const events = await prisma.auditEvent.findMany({ where: { workspace_id: ws.id }, orderBy: { occurred_at: 'asc' } });
    expect(events.map((e) => e.action)).toEqual(['member.invited', 'invitation.accepted']);
    expect(JSON.stringify(events)).not.toContain('invitee@acme.test');
    expect(JSON.stringify(events)).not.toContain(token);

    await expect(uc.accept.execute({ token, context: ctx(invitee.id, 'member') })).rejects.toMatchObject({
      code: 'invitation_used',
    });
  });

  it('accept: the wrong account and an unverified account are refused', async () => {
    const { ws, owner } = await workspaceWith([]);
    const invitee = await user('invitee2@acme.test', false);
    const stranger = await user('stranger@acme.test');
    const uc = useCases();
    await uc.invite.execute({ context: ctx(owner.id, 'owner', ws.id), email: 'invitee2@acme.test', role: 'viewer' });
    const token = String(uc.email.getLastEmail()!.params.url).split('/').pop()!;

    await expect(uc.accept.execute({ token, context: ctx(stranger.id, 'member') })).rejects.toMatchObject({
      code: 'invitation_email_mismatch',
    });
    await expect(uc.accept.execute({ token, context: ctx(invitee.id, 'member') })).rejects.toMatchObject({
      code: 'email_not_verified',
    });
    expect(await members.findMembership(ws.id, invitee.id)).toBeNull();
  });

  it('two concurrent accepts add one membership and one audit row', async () => {
    const { ws, owner } = await workspaceWith([]);
    const invitee = await user('race@acme.test');
    const uc = useCases();
    await uc.invite.execute({ context: ctx(owner.id, 'owner', ws.id), email: 'race@acme.test', role: 'member' });
    const token = String(uc.email.getLastEmail()!.params.url).split('/').pop()!;

    const results = await Promise.allSettled([
      uc.accept.execute({ token, context: ctx(invitee.id, 'member') }),
      uc.accept.execute({ token, context: ctx(invitee.id, 'member') }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.workspaceMember.count({ where: { workspace_id: ws.id, user_id: invitee.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { workspace_id: ws.id, action: 'invitation.accepted' } })).toBe(1);
  });

  it('removal deletes the membership at once, so the next resolution of the session has no access', async () => {
    const { ws, owner, people } = await workspaceWith(['member']);
    const person = people[1]!.user;
    const memberRow = (await members.findMembership(ws.id, person.id))!;
    await prisma.session.create({
      data: {
        user_id: person.id,
        token: `t-${Math.random()}`,
        active_workspace_id: ws.id,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });

    await useCases().remove.execute({ context: ctx(owner.id, 'owner', ws.id), member_id: memberRow.id });

    // What `resolveSessionFromToken` reads on every request.
    const resolved = await prisma.user.findUnique({ where: { id: person.id }, include: { memberships: true } });
    expect(resolved!.memberships.filter((m) => m.workspace_id === ws.id)).toEqual([]);
    expect(await prisma.session.count({ where: { user_id: person.id, revoked_at: null } })).toBe(0);
    expect(await prisma.user.count({ where: { id: person.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { workspace_id: ws.id, action: 'member.removed' } })).toBe(1);
  });

  it('the owner cannot be removed or demoted and stays the single owner', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const uc = useCases();
    const ownerRow = (await members.findMembership(ws.id, owner.id))!;
    await expect(uc.remove.execute({ context: ctx(owner.id, 'owner', ws.id), member_id: ownerRow.id })).rejects.toMatchObject({ code: 'last_owner' });
    await expect(uc.update.execute({ context: ctx(owner.id, 'owner', ws.id), member_id: ownerRow.id, role: 'admin' })).rejects.toMatchObject({ code: 'last_owner' });
    await expect(uc.remove.execute({ context: ctx(people[1]!.user.id, 'admin', ws.id), member_id: ownerRow.id })).rejects.toMatchObject({ status: 403 });
    expect(await prisma.workspaceMember.count({ where: { workspace_id: ws.id, role: 'owner' } })).toBe(1);
  });

  it('transfer: request, confirm, swap and notices; the audit row commits with the swap', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const admin = people[1]!.user;
    const uc = useCases();
    const adminRow = (await members.findMembership(ws.id, admin.id))!;

    await uc.requestTransfer.execute({ context: ctx(owner.id, 'owner', ws.id), target_member_id: adminRow.id });
    const token = String(uc.email.getLastEmail()!.params.url).split('/').pop()!;
    uc.email.clear();

    await uc.acceptTransfer.execute({ token, context: ctx(admin.id, 'admin') });
    expect((await members.findMembership(ws.id, admin.id))!.role).toBe('owner');
    expect((await members.findMembership(ws.id, owner.id))!.role).toBe('admin');
    expect((await prisma.workspace.findUnique({ where: { id: ws.id } }))!.owner_user_id).toBe(admin.id);
    expect(uc.email.getSentEmails()).toHaveLength(2);
    expect(await prisma.auditEvent.count({ where: { workspace_id: ws.id, action: 'workspace.ownership_transferred' } })).toBe(1);
  });

  it('transfer accepted twice at once: one swap, one owner', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const admin = people[1]!.user;
    const uc = useCases();
    const adminRow = (await members.findMembership(ws.id, admin.id))!;
    await uc.requestTransfer.execute({ context: ctx(owner.id, 'owner', ws.id), target_member_id: adminRow.id });
    const token = String(uc.email.getLastEmail()!.params.url).split('/').pop()!;

    const results = await Promise.allSettled([
      uc.acceptTransfer.execute({ token, context: ctx(admin.id, 'admin') }),
      uc.acceptTransfer.execute({ token, context: ctx(admin.id, 'admin') }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.workspaceMember.count({ where: { workspace_id: ws.id, role: 'owner' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { workspace_id: ws.id, action: 'workspace.ownership_transferred' } })).toBe(1);
  });

  it('a removal during a pending transfer makes the transfer stale instead of orphaning the workspace', async () => {
    const { ws, owner, people } = await workspaceWith(['admin']);
    const admin = people[1]!.user;
    const uc = useCases();
    const adminRow = (await members.findMembership(ws.id, admin.id))!;
    await uc.requestTransfer.execute({ context: ctx(owner.id, 'owner', ws.id), target_member_id: adminRow.id });
    const token = String(uc.email.getLastEmail()!.params.url).split('/').pop()!;

    await uc.remove.execute({ context: ctx(owner.id, 'owner', ws.id), member_id: adminRow.id });
    await expect(uc.acceptTransfer.execute({ token, context: ctx(admin.id, 'admin') })).rejects.toMatchObject({
      code: 'ownership_transfer_stale',
    });
    expect((await members.findMembership(ws.id, owner.id))!.role).toBe('owner');
    expect(await prisma.workspaceMember.count({ where: { workspace_id: ws.id, role: 'owner' } })).toBe(1);
  });
});
