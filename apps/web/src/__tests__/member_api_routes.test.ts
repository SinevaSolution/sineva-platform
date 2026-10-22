import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AlreadyMemberError,
  InvitationEmailMismatchError,
  InvitationStateError,
  LastOwnerError,
} from '@/server/domain/members/member_errors';
import { setCustomSessionResolver } from '@/server/http/with_auth';
import { GET as listMembers } from '@/app/api/v1/workspaces/[workspace_id]/members/route';
import {
  DELETE as removeMember,
  GET as getMember,
  PATCH as patchMember,
} from '@/app/api/v1/workspaces/[workspace_id]/members/[member_id]/route';
import { PUT as putSpecialists } from '@/app/api/v1/workspaces/[workspace_id]/members/[member_id]/specialists/route';
import { DELETE as leaveWorkspace } from '@/app/api/v1/workspaces/[workspace_id]/members/me/route';
import {
  GET as listInvitations,
  POST as postInvitation,
} from '@/app/api/v1/workspaces/[workspace_id]/invitations/route';
import { DELETE as revokeInvitation } from '@/app/api/v1/workspaces/[workspace_id]/invitations/[invitation_id]/route';
import { POST as resendInvitation } from '@/app/api/v1/workspaces/[workspace_id]/invitations/[invitation_id]/resend/route';
import {
  DELETE as cancelTransfer,
  GET as getTransfer,
  POST as postTransfer,
} from '@/app/api/v1/workspaces/[workspace_id]/transfer-ownership/route';
import { GET as previewInvitation } from '@/app/api/v1/invitations/[token]/route';
import { POST as acceptInvitation } from '@/app/api/v1/invitations/[token]/accept/route';
import { GET as previewTransfer } from '@/app/api/v1/ownership-transfers/[token]/route';
import { POST as acceptTransfer } from '@/app/api/v1/ownership-transfers/[token]/accept/route';

const mocks = vi.hoisted(() => ({
  listMembers: vi.fn(),
  getMember: vi.fn(),
  update: vi.fn(),
  setSpecialists: vi.fn(),
  remove: vi.fn(),
  leave: vi.fn(),
  invite: vi.fn(),
  listInvitations: vi.fn(),
  resend: vi.fn(),
  revoke: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  requestTransfer: vi.fn(),
  getTransfer: vi.fn(),
  cancelTransfer: vi.fn(),
  previewTransfer: vi.fn(),
  acceptTransfer: vi.fn(),
}));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getListMembersUseCase: () => ({ execute: mocks.listMembers }),
    getGetMemberUseCase: () => ({ execute: mocks.getMember }),
    getUpdateMemberUseCase: () => ({ execute: mocks.update }),
    getSetMemberSpecialistsUseCase: () => ({ execute: mocks.setSpecialists }),
    getRemoveMemberUseCase: () => ({ execute: mocks.remove }),
    getLeaveWorkspaceUseCase: () => ({ execute: mocks.leave }),
    getInviteMemberUseCase: () => ({ execute: mocks.invite }),
    getListInvitationsUseCase: () => ({ execute: mocks.listInvitations }),
    getResendInvitationUseCase: () => ({ execute: mocks.resend }),
    getRevokeInvitationUseCase: () => ({ execute: mocks.revoke }),
    getPreviewInvitationUseCase: () => ({ execute: mocks.previewInvitation }),
    getAcceptInvitationUseCase: () => ({ execute: mocks.acceptInvitation }),
    getRequestOwnershipTransferUseCase: () => ({ execute: mocks.requestTransfer }),
    getGetOwnershipTransferUseCase: () => ({ execute: mocks.getTransfer }),
    getCancelOwnershipTransferUseCase: () => ({ execute: mocks.cancelTransfer }),
    getPreviewOwnershipTransferUseCase: () => ({ execute: mocks.previewTransfer }),
    getAcceptOwnershipTransferUseCase: () => ({ execute: mocks.acceptTransfer }),
  };
});

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ-_';
const base = `https://app.sineva.id/api/v1/workspaces/${WS}`;

function as(role: string, init: { method?: string; body?: unknown; workspaces?: string; url?: string } = {}) {
  return new NextRequest(init.url ?? base, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-test-session-user-id': 'usr-1',
      'x-test-session-role': role,
      'x-test-session-workspaces': init.workspaces ?? WS,
      'x-sineva-action': '1',
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const wsParams = { params: Promise.resolve({ workspace_id: WS }) };
const memberParams = { params: Promise.resolve({ workspace_id: WS, member_id: MEMBER_ID }) };
const invitationParams = { params: Promise.resolve({ workspace_id: WS, invitation_id: INVITATION_ID }) };
const tokenParams = { params: Promise.resolve({ token: TOKEN }) };

installHeaderSessionResolver();

beforeEach(() => {
  vi.clearAllMocks();
  installHeaderSessionResolver();
});

describe('GET members (FR-AUTH-18)', () => {
  const url = `${base}/members`;

  it('401 without a session', async () => {
    const res = await listMembers(
      new NextRequest(url, { headers: { 'x-test-unauthenticated': 'true' } }),
      wsParams,
    );
    expect(res.status).toBe(401);
  });

  it('404 for a workspace the caller is not in (never 403)', async () => {
    const res = await listMembers(as('owner', { url, workspaces: OTHER }), wsParams);
    expect(res.status).toBe(404);
    expect(mocks.listMembers).not.toHaveBeenCalled();
  });

  it('200 for every role, with the context the guard built', async () => {
    mocks.listMembers.mockResolvedValue([{ id: MEMBER_ID }]);
    for (const role of ['owner', 'admin', 'member', 'viewer']) {
      const res = await listMembers(as(role, { url }), wsParams);
      expect(res.status).toBe(200);
    }
    expect(mocks.listMembers.mock.calls[0]![0].context).toMatchObject({ workspace_id: WS, role: 'owner' });
  });
});

describe('invitations routes (FR-AUTH-16, FR-AUTH-17)', () => {
  const url = `${base}/invitations`;
  const body = { email: 'new@acme.test', role: 'member' };

  it('POST: 401, 404 cross-workspace, 403 for member and viewer', async () => {
    expect(
      (await postInvitation(new NextRequest(url, { method: 'POST', headers: { 'x-test-unauthenticated': 'true' } }), wsParams)).status,
    ).toBe(401);
    expect((await postInvitation(as('owner', { url, method: 'POST', body, workspaces: OTHER }), wsParams)).status).toBe(404);
    for (const role of ['member', 'viewer']) {
      expect((await postInvitation(as(role, { url, method: 'POST', body }), wsParams)).status).toBe(403);
    }
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it('POST: 422 for owner role, bad email, unknown keys and empty body', async () => {
    for (const bad of [
      { email: 'x@y.test', role: 'owner' },
      { email: 'nope', role: 'member' },
      { ...body, extra: 1 },
    ]) {
      expect((await postInvitation(as('owner', { url, method: 'POST', body: bad }), wsParams)).status).toBe(422);
    }
    const empty = new NextRequest(url, {
      method: 'POST',
      headers: { 'x-test-session-user-id': 'u', 'x-test-session-role': 'owner', 'x-test-session-workspaces': WS },
    });
    expect((await postInvitation(empty, wsParams)).status).toBe(422);
  });

  it('POST: 201 with the envelope, snake_case body and the link only in this response', async () => {
    mocks.invite.mockResolvedValue({
      invitation: { id: INVITATION_ID, email: 'new@acme.test' },
      invite_url: `https://app.sineva.id/invite/${TOKEN}`,
      replaced: false,
      email_sent: true,
    });
    const res = await postInvitation(as('admin', { url, method: 'POST', body }), wsParams);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data.invite_url).toContain(TOKEN);
    expect(mocks.invite.mock.calls[0]![0]).toMatchObject({ email: 'new@acme.test', role: 'member' });
    // Identity never comes from the body.
    expect(mocks.invite.mock.calls[0]![0].context.workspace_id).toBe(WS);
  });

  it('POST: 409 already_member carries the machine code', async () => {
    mocks.invite.mockRejectedValue(new AlreadyMemberError());
    const res = await postInvitation(as('owner', { url, method: 'POST', body }), wsParams);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.errors[0].code).toBe('already_member');
  });

  it('GET list: 403 for member, 200 for admin', async () => {
    mocks.listInvitations.mockResolvedValue([]);
    expect((await listInvitations(as('member', { url }), wsParams)).status).toBe(403);
    expect((await listInvitations(as('admin', { url }), wsParams)).status).toBe(200);
  });

  it('resend and revoke: 403 for member, 404 for another workspace, 422 for a bad id, 200 and 204-style success', async () => {
    const resendUrl = `${url}/${INVITATION_ID}/resend`;
    expect((await resendInvitation(as('member', { url: resendUrl, method: 'POST' }), invitationParams)).status).toBe(403);
    expect((await resendInvitation(as('owner', { url: resendUrl, method: 'POST', workspaces: OTHER }), invitationParams)).status).toBe(404);
    expect(
      (await resendInvitation(as('owner', { url: resendUrl, method: 'POST' }), { params: Promise.resolve({ workspace_id: WS, invitation_id: 'x' }) })).status,
    ).toBe(422);

    mocks.resend.mockResolvedValue({ invitation: { id: INVITATION_ID }, invite_url: 'u', replaced: true, email_sent: true });
    expect((await resendInvitation(as('owner', { url: resendUrl, method: 'POST' }), invitationParams)).status).toBe(200);

    mocks.revoke.mockResolvedValue(undefined);
    expect((await revokeInvitation(as('member', { url: `${url}/${INVITATION_ID}`, method: 'DELETE' }), invitationParams)).status).toBe(403);
    expect((await revokeInvitation(as('admin', { url: `${url}/${INVITATION_ID}`, method: 'DELETE' }), invitationParams)).status).toBe(200);
  });
});

describe('member routes (FR-AUTH-18, FR-AUTH-19)', () => {
  const url = `${base}/members/${MEMBER_ID}`;

  it('GET one: 404 cross-workspace, 200 in the workspace', async () => {
    mocks.getMember.mockResolvedValue({ id: MEMBER_ID });
    expect((await getMember(as('owner', { url, workspaces: OTHER }), memberParams)).status).toBe(404);
    expect((await getMember(as('member', { url }), memberParams)).status).toBe(200);
  });

  it('PATCH: 403 for member and viewer, 422 for empty, owner role and orphan slugs, 200 for admin', async () => {
    for (const role of ['member', 'viewer']) {
      expect((await patchMember(as(role, { url, method: 'PATCH', body: { role: 'viewer' } }), memberParams)).status).toBe(403);
    }
    for (const bad of [{}, { role: 'owner' }, { specialist_slugs: ['sinopeople'] }, { role: 'admin', extra: true }]) {
      expect((await patchMember(as('owner', { url, method: 'PATCH', body: bad }), memberParams)).status).toBe(422);
    }
    expect((await patchMember(as('owner', { url, method: 'PATCH', body: { role: 'admin' }, workspaces: OTHER }), memberParams)).status).toBe(404);
    mocks.update.mockResolvedValue({ id: MEMBER_ID, role: 'viewer' });
    const res = await patchMember(as('admin', { url, method: 'PATCH', body: { role: 'viewer' } }), memberParams);
    expect(res.status).toBe(200);
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({ member_id: MEMBER_ID, role: 'viewer' });
  });

  it('PUT specialists: 403 for member, 422 for an empty list, 200 for owner', async () => {
    const putUrl = `${url}/specialists`;
    expect((await putSpecialists(as('member', { url: putUrl, method: 'PUT', body: { specialist_slugs: ['sinopeople'] } }), memberParams)).status).toBe(403);
    expect((await putSpecialists(as('owner', { url: putUrl, method: 'PUT', body: { specialist_slugs: [] } }), memberParams)).status).toBe(422);
    mocks.setSpecialists.mockResolvedValue({ id: MEMBER_ID });
    expect((await putSpecialists(as('owner', { url: putUrl, method: 'PUT', body: { specialist_slugs: ['sinopeople'] } }), memberParams)).status).toBe(200);
    expect((await putSpecialists(as('owner', { url: putUrl, method: 'PUT', body: { specialist_slugs: ['sinopeople'] }, workspaces: OTHER }), memberParams)).status).toBe(404);
  });

  it('DELETE: 401, 403 for member, 404 cross-workspace, 409 last owner, 200', async () => {
    mocks.remove.mockResolvedValue(undefined);
    expect((await removeMember(new NextRequest(url, { method: 'DELETE', headers: { 'x-test-unauthenticated': 'true' } }), memberParams)).status).toBe(401);
    expect((await removeMember(as('member', { url, method: 'DELETE' }), memberParams)).status).toBe(403);
    expect((await removeMember(as('owner', { url, method: 'DELETE', workspaces: OTHER }), memberParams)).status).toBe(404);
    expect((await removeMember(as('admin', { url, method: 'DELETE' }), memberParams)).status).toBe(200);
    mocks.remove.mockRejectedValue(new LastOwnerError('remove'));
    const res = await removeMember(as('owner', { url, method: 'DELETE' }), memberParams);
    expect(res.status).toBe(409);
    expect((await res.json()).errors[0].code).toBe('last_owner');
  });

  it('DELETE requires a fresh session (FR-AUTH-06)', async () => {
    setCustomSessionResolver(async () => ({
      userId: 'usr-1',
      sessionId: 's',
      role: 'owner',
      freshUntil: new Date(Date.now() - 1000),
      emailVerified: true,
      memberships: [{ workspaceId: WS, role: 'owner', specialistScope: 'all' }],
    }));
    const res = await removeMember(as('owner', { url, method: 'DELETE' }), memberParams);
    expect(res.status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('DELETE members/me lets any member leave; the last owner gets 409', async () => {
    const meUrl = `${base}/members/me`;
    mocks.leave.mockResolvedValue(undefined);
    for (const role of ['admin', 'member', 'viewer']) {
      expect((await leaveWorkspace(as(role, { url: meUrl, method: 'DELETE' }), wsParams)).status).toBe(200);
    }
    expect((await leaveWorkspace(as('member', { url: meUrl, method: 'DELETE', workspaces: OTHER }), wsParams)).status).toBe(404);
    mocks.leave.mockRejectedValue(new LastOwnerError('leave'));
    expect((await leaveWorkspace(as('owner', { url: meUrl, method: 'DELETE' }), wsParams)).status).toBe(409);
  });
});

describe('transfer-ownership routes (FR-AUTH-14)', () => {
  const url = `${base}/transfer-ownership`;
  const body = { target_member_id: MEMBER_ID };

  it('only the owner: 403 for admin, member and viewer on every method', async () => {
    for (const role of ['admin', 'member', 'viewer']) {
      expect((await postTransfer(as(role, { url, method: 'POST', body }), wsParams)).status).toBe(403);
      expect((await getTransfer(as(role, { url }), wsParams)).status).toBe(403);
      expect((await cancelTransfer(as(role, { url, method: 'DELETE' }), wsParams)).status).toBe(403);
    }
  });

  it('404 cross-workspace, 422 for a bad body, 201 for the owner', async () => {
    expect((await postTransfer(as('owner', { url, method: 'POST', body, workspaces: OTHER }), wsParams)).status).toBe(404);
    expect((await postTransfer(as('owner', { url, method: 'POST', body: { target_member_id: 'x' } }), wsParams)).status).toBe(422);
    mocks.requestTransfer.mockResolvedValue({ id: 't' });
    expect((await postTransfer(as('owner', { url, method: 'POST', body }), wsParams)).status).toBe(201);
  });

  it('GET answers null data when nothing is open, DELETE cancels', async () => {
    mocks.getTransfer.mockResolvedValue(null);
    const res = await getTransfer(as('owner', { url }), wsParams);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBeNull();
    mocks.cancelTransfer.mockResolvedValue(undefined);
    expect((await cancelTransfer(as('owner', { url, method: 'DELETE' }), wsParams)).status).toBe(200);
  });

  it('starting a transfer needs a fresh session', async () => {
    setCustomSessionResolver(async () => ({
      userId: 'usr-1',
      sessionId: 's',
      role: 'owner',
      freshUntil: null,
      emailVerified: true,
      memberships: [{ workspaceId: WS, role: 'owner', specialistScope: 'all' }],
    }));
    expect((await postTransfer(as('owner', { url, method: 'POST', body }), wsParams)).status).toBe(403);
  });
});

describe('invitation link routes (FR-AUTH-16)', () => {
  const previewUrl = `https://app.sineva.id/api/v1/invitations/${TOKEN}`;

  it('preview is public and passes the viewer id only when signed in', async () => {
    mocks.previewInvitation.mockResolvedValue({ state: 'pending', workspace_name: 'Warung Sari' });
    const anonymous = await previewInvitation(
      new NextRequest(previewUrl, { headers: { 'x-test-unauthenticated': 'true' } }),
      tokenParams,
    );
    expect(anonymous.status).toBe(200);
    expect(mocks.previewInvitation.mock.calls[0]![0].viewer_user_id).toBeUndefined();

    await previewInvitation(as('member', { url: previewUrl }), tokenParams);
    expect(mocks.previewInvitation.mock.calls[1]![0].viewer_user_id).toBe('usr-1');
  });

  it('preview rejects a malformed token with 422 before touching the repository', async () => {
    const res = await previewInvitation(new NextRequest(previewUrl, { headers: { 'x-test-unauthenticated': 'true' } }), {
      params: Promise.resolve({ token: 'short' }),
    });
    expect(res.status).toBe(422);
    expect(mocks.previewInvitation).not.toHaveBeenCalledTimes(2);
  });

  it('accept needs a session (401) and surfaces wrong-account and state errors', async () => {
    const acceptUrl = `${previewUrl}/accept`;
    const anon = await acceptInvitation(
      new NextRequest(acceptUrl, { method: 'POST', headers: { 'x-test-unauthenticated': 'true' } }),
      tokenParams,
    );
    expect(anon.status).toBe(401);

    mocks.acceptInvitation.mockResolvedValue({ workspace: { id: WS }, role: 'member' });
    const ok = await acceptInvitation(as('member', { url: acceptUrl, method: 'POST', workspaces: '' }), tokenParams);
    expect(ok.status).toBe(200);
    expect(mocks.acceptInvitation.mock.calls[0]![0]).toMatchObject({ token: TOKEN });

    mocks.acceptInvitation.mockRejectedValue(new InvitationEmailMismatchError());
    const mismatch = await acceptInvitation(as('member', { url: acceptUrl, method: 'POST', workspaces: '' }), tokenParams);
    expect(mismatch.status).toBe(403);
    expect((await mismatch.json()).errors[0].code).toBe('invitation_email_mismatch');

    mocks.acceptInvitation.mockRejectedValue(new InvitationStateError('expired'));
    const expired = await acceptInvitation(as('member', { url: acceptUrl, method: 'POST', workspaces: '' }), tokenParams);
    expect(expired.status).toBe(409);
    expect((await expired.json()).errors[0].code).toBe('invitation_expired');
  });
});

describe('ownership transfer link routes (FR-AUTH-14)', () => {
  const previewUrl = `https://app.sineva.id/api/v1/ownership-transfers/${TOKEN}`;

  it('preview is public', async () => {
    mocks.previewTransfer.mockResolvedValue({ state: 'pending' });
    const res = await previewTransfer(
      new NextRequest(previewUrl, { headers: { 'x-test-unauthenticated': 'true' } }),
      tokenParams,
    );
    expect(res.status).toBe(200);
  });

  it('accept needs a session and a fresh one', async () => {
    const acceptUrl = `${previewUrl}/accept`;
    expect(
      (await acceptTransfer(new NextRequest(acceptUrl, { method: 'POST', headers: { 'x-test-unauthenticated': 'true' } }), tokenParams)).status,
    ).toBe(401);
    mocks.acceptTransfer.mockResolvedValue({ workspace: { id: WS }, notices_sent: true });
    expect((await acceptTransfer(as('admin', { url: acceptUrl, method: 'POST', workspaces: '' }), tokenParams)).status).toBe(200);

    setCustomSessionResolver(async () => ({
      userId: 'usr-1',
      sessionId: 's',
      freshUntil: new Date(Date.now() - 1000),
      emailVerified: true,
      memberships: [],
    }));
    expect((await acceptTransfer(as('admin', { url: acceptUrl, method: 'POST', workspaces: '' }), tokenParams)).status).toBe(403);
  });
});
