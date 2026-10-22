import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaGatewayState } from '@/server/infrastructure/gateway/prisma_gateway_state';
import type { GatewayContext } from '@/server/domain/toolgateway/gateway_context';
import { hashPayload } from '@/server/domain/approvals/action_types';
const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
afterAll(() => prisma.$disconnect());
async function setup() {
  const user = await prisma.user.create({
    data: { email: 'gateway@example.test', full_name: 'Gateway test' },
  });
  const workspace = await prisma.workspace.create({
    data: { workspace_name: 'Gateway', workspace_slug: 'gateway-test' },
  });
  const claims = {
    tenant_id: workspace.id,
    user_id: user.id,
    run_id: 'run_33333333-3333-4333-8333-333333333333',
  } as GatewayContext;
  const request = {
    tool_name: 'gmail_send_message',
    arguments: { to: ['a@example.test'] },
    run_id: claims.run_id,
    call_id: 'call-1',
    idempotency_key: 'send-key',
    mode: 'live' as const,
  };
  const state = new PrismaGatewayState(prisma, { take: async () => true });
  return { state, claims, request, workspace, user };
}
describe('durable Tool Gateway reservations', () => {
  it('reserves a call only once under concurrent callers', async () => {
    const { state, claims, request } = await setup();
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => state.claim(claims, request, hashPayload(request))),
    );
    expect(attempts.filter((r) => r.status === 'claimed')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'busy')).toHaveLength(9);
  });
  it('returns the stored result after a new process takes over', async () => {
    const { state, claims, request } = await setup();
    const first = await state.claim(claims, request, hashPayload(request));
    if (first.status !== 'claimed') throw new Error('expected first claim');
    const response = {
      status: 'ok' as const,
      error_code: null,
      result: { message_id: 'sent-once' },
    };
    await state.finish(first.id, response);
    const nextProcess = new PrismaGatewayState(prisma, { take: async () => true });
    await expect(nextProcess.claim(claims, request, hashPayload(request))).resolves.toEqual({
      status: 'replay',
      response,
    });
  });
  it('refuses reuse of an idempotency key or call id for changed arguments', async () => {
    const { state, claims, request } = await setup();
    await state.claim(claims, request, hashPayload(request));
    await expect(state.claim(claims, request, hashPayload({ different: true }))).resolves.toEqual({
      status: 'conflict',
    });
    await expect(
      state.claim(claims, { ...request, idempotency_key: 'new-key' }, hashPayload(request)),
    ).resolves.toEqual({ status: 'conflict' });
  });
  it('isolates the idempotency namespace by tenant and principal', async () => {
    const { state, claims, request } = await setup();
    await state.claim(claims, request, hashPayload(request));
    const other = await prisma.user.create({
      data: { email: 'other@example.test', full_name: 'Other' },
    });
    await expect(
      state.claim({ ...claims, user_id: other.id }, request, hashPayload(request)),
    ).resolves.toMatchObject({ status: 'claimed' });
  });
  it('reads provider and workspace kill switches on every call', async () => {
    const { state, workspace } = await setup();
    expect(await state.isBlocked(workspace.id, 'gmail', 'sinosales', true)).toBe(false);
    await prisma.killSwitch.create({
      data: { scope: 'provider', target: 'gmail', enabled_by: 'operator' },
    });
    expect(await state.isBlocked(workspace.id, 'gmail', 'sinosales', true)).toBe(true);
    await prisma.killSwitch.deleteMany();
    await prisma.killSwitch.create({
      data: { scope: 'read_only', target: workspace.id, enabled_by: 'operator' },
    });
    expect(await state.isBlocked(workspace.id, 'gmail', 'sinosales', true)).toBe(true);
    expect(await state.isBlocked(workspace.id, 'gmail', 'sinosales', false)).toBe(false);
    await prisma.killSwitch.deleteMany();
  });
  it('rechecks current membership and run ownership rather than trusting the signed role', async () => {
    const { state, claims, workspace, user } = await setup();
    await prisma.user.update({ where: { id: user.id }, data: { email_verified: true } });
    await prisma.workspaceMember.create({
      data: { workspace_id: workspace.id, user_id: user.id, role: 'member' },
    });
    const conversation = await prisma.conversation.create({
      data: { workspace_id: workspace.id, user_id: user.id, kind: 'room', agent_slug: 'sinosales' },
    });
    const message = await prisma.message.create({
      data: { conversation_id: conversation.id, role: 'user', content: 'Read one email' },
    });
    await prisma.chatRun.create({
      data: {
        workspace_id: workspace.id,
        conversation_id: conversation.id,
        user_message_id: message.id,
        run_handle: claims.run_id,
        agent_slug: 'sinosales',
        status: 'streaming',
      },
    });
    const scoped = {
      ...claims,
      agent_slug: 'sinosales',
      request_id: 'request-1',
      role: 'owner' as const,
    };
    await expect(state.authorize(scoped)).resolves.toMatchObject({
      user_id: user.id,
      workspace_id: workspace.id,
      role: 'member',
    });
    await prisma.workspaceMember.deleteMany({ where: { workspace_id: workspace.id } });
    await expect(state.authorize(scoped)).rejects.toMatchObject({ code: 'action_not_allowed' });
  });
});
