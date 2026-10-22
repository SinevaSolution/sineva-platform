import { afterAll, describe, expect, it, vi } from 'vitest';
import { ExecuteToolUseCase } from '@/server/application/toolgateway/execute_tool_use_case';
import { CreateGatewayApproval } from '@/server/application/toolgateway/create_gateway_approval';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import { CreateInboxItemUseCase } from '@/server/application/use-cases/inbox/create_inbox_item_use_case';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { hashPayload } from '@/server/domain/approvals/action_types';
import type { GatewayContext } from '@/server/domain/toolgateway/gateway_context';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { PrismaGatewayState } from '@/server/infrastructure/gateway/prisma_gateway_state';
import { PrismaConnectionRepository } from '@/server/infrastructure/database/prisma_connection_repository';
import { PrismaConnectionGrantRepository } from '@/server/infrastructure/database/prisma_connection_grant_repository';
import { PrismaChatRunRepository } from '@/server/infrastructure/database/prisma_chat_run_repository';
import { PrismaInboxRepository } from '@/server/infrastructure/database/prisma_inbox_repository';
import { redactToolResult } from '@/server/infrastructure/gateway/redact_tool_result';
const admissionSamples: number[] = [];
const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
afterAll(async () => {
  if (admissionSamples.length) {
    const ordered = admissionSamples.toSorted((a, b) => a - b);
    process.stdout.write(
      `Gateway write admission, local Postgres, fake verifier and audit: n=${ordered.length}, median=${ordered[Math.floor(ordered.length / 2)]!.toFixed(2)}ms, min=${ordered[0]!.toFixed(2)}ms, max=${ordered.at(-1)!.toFixed(2)}ms\n`,
    );
  }
  await prisma.$disconnect();
});
async function setup() {
  const user = await prisma.user.create({
    data: { email: 'gateway@example.test', full_name: 'Gateway', email_verified: true },
  });
  const workspace = await prisma.workspace.create({
    data: { workspace_name: 'Gateway', workspace_slug: 'gateway' },
  });
  await prisma.workspaceMember.create({
    data: { workspace_id: workspace.id, user_id: user.id, role: 'member' },
  });
  const conversation = await prisma.conversation.create({
    data: { workspace_id: workspace.id, user_id: user.id, kind: 'room', agent_slug: 'sinosales' },
  });
  const message = await prisma.message.create({
    data: { conversation_id: conversation.id, role: 'user', content: 'Send this email' },
  });
  const runId = 'run_33333333-3333-4333-8333-333333333333';
  await prisma.chatRun.create({
    data: {
      workspace_id: workspace.id,
      conversation_id: conversation.id,
      user_message_id: message.id,
      run_handle: runId,
      agent_slug: 'sinosales',
      status: 'streaming',
      upstream_run_id: 'upstream-1',
    },
  });
  const now = Math.floor(Date.now() / 1000);
  const claims: GatewayContext = {
    iss: 'sineva-platform',
    aud: 'sineva-ai',
    jti: 'j1',
    iat: now,
    exp: now + 60,
    tenant_id: workspace.id,
    user_id: user.id,
    role: 'member',
    agent_slug: 'sinosales',
    allowed_agents: ['sinosales'],
    run_id: runId,
    request_id: 'request-1',
    locale: 'en',
    allowed_tools: ['gmail_send_message'],
    skill_tools: ['gmail_send_message'],
    trifecta: { private_data: true, untrusted_content: true, send: true },
  };
  const connections = new PrismaConnectionRepository(prisma);
  const grants = new PrismaConnectionGrantRepository(prisma);
  const connection = await connections.create({
    workspace_id: workspace.id,
    provider_id: 'gmail',
    owner_scope: 'workspace',
    owner_user_id: null,
    created_by_user_id: user.id,
    auth_type: 'oauth2_pkce',
    status: 'connected',
    scope_bundle: 'email_compose',
    requested_scopes: [],
    granted_scopes: ['https://www.googleapis.com/auth/gmail.compose'],
    external_account_id: 'account-1',
    account_label: 'from@example.test',
    access_expires_at: null,
    refresh_expires_at: null,
  });
  await grants.replaceAll(
    workspace.id,
    connection.id,
    [{ agent_slug: 'sinosales', access_level: 'write' }],
    user.id,
  );
  const inbox = new PrismaInboxRepository(prisma);
  const audit = new CountingAuditLogger();
  const transactions = new PrismaTransactionRunner(prisma);
  const state = new PrismaGatewayState(prisma, { take: async () => true });
  let sends = 0;
  const deps = {
    verifier: { verify: async () => claims },
    state,
    registry: new ConnectorRegistry(PROVIDER_MANIFESTS, {
      credentialsAvailable: () => true,
      specialistsFor: () => ['sinosales'],
    }),
    connections,
    grants,
    credentials: {
      forConnection: async () => ({ credentials: { access_token: 'private-token' }, connection }),
    },
    executor: {
      supports: () => true,
      endpoint: () => 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      execute: async () => {
        sends += 1;
        return { message_id: 'sent-1', thread_id: 'thread-1' };
      },
    },
    approvals: new CreateGatewayApproval(
      new CreateInboxItemUseCase({ inbox, audit, transactions }),
      new PrismaChatRunRepository(prisma),
    ),
    audit,
    transactions,
    redact: redactToolResult,
  };
  const gateway = new ExecuteToolUseCase(deps);
  const admittedAt = performance.now();
  const response = await gateway.execute(
    {
      tool_name: 'gmail_send_message',
      arguments: { to: ['person@example.test'], subject: 'Hello', body_text: 'Approved text' },
      run_id: runId,
      call_id: 'send-1',
      idempotency_key: 'send-key-1',
      mode: 'live',
    },
    'signed-test-context',
  );
  admissionSamples.push(performance.now() - admittedAt);
  if (!response.approval_id) throw new Error('approval expected');
  const approval = await inbox.findApprovalByUpstreamId(workspace.id, response.approval_id);
  if (!approval) throw new Error('platform approval expected');
  await inbox.claimApproval(
    approval.id,
    { expected_version: 1, user_id: user.id, decision: 'approve' },
    new Date(),
  );
  const context = {
    user_id: user.id,
    workspace_id: workspace.id,
    role: 'member' as const,
    session_id: 'session-1',
    request_id: 'request-1',
  };
  return {
    gateway,
    deps,
    context,
    approvalId: approval.id,
    connection,
    claims,
    sends: () => sends,
  };
}
describe('gateway approval execution with Postgres', () => {
  it('creates an approval without sending, then executes exactly once across retries and instances', async () => {
    const h = await setup();
    expect(h.sends()).toBe(0);
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).resolves.toMatchObject({
      status: 'ok',
      result: { message_id: 'sent-1' },
    });
    const next = new ExecuteToolUseCase({
      ...h.deps,
      state: new PrismaGatewayState(prisma, { take: async () => true }),
    });
    await expect(next.executeApproved(h.approvalId, h.context)).resolves.toMatchObject({
      status: 'ok',
    });
    expect(h.sends()).toBe(1);
  });
  it('executes once under concurrent approval execution attempts', async () => {
    const h = await setup();
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => h.gateway.executeApproved(h.approvalId, h.context)),
    );
    expect(attempts.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(h.sends()).toBe(1);
  });
  it('refuses payload tampering even if the stored approval hash was recomputed', async () => {
    const h = await setup();
    const approval = await prisma.approval.findUniqueOrThrow({ where: { id: h.approvalId } });
    const payload = approval.payload as { request: { arguments: { subject: string } } };
    payload.request.arguments.subject = 'Changed after approval';
    await prisma.approval.update({
      where: { id: h.approvalId },
      data: { payload, payload_hash: hashPayload(payload) },
    });
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).rejects.toMatchObject({
      code: 'approval_payload_mismatch',
    });
    expect(h.sends()).toBe(0);
  });
  it('refuses an account changed by reconnect after the review was created', async () => {
    const h = await setup();
    await prisma.connection.update({
      where: { id: h.connection.id },
      data: { external_account_id: 'different-account' },
    });
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).rejects.toMatchObject({
      code: 'approval_payload_mismatch',
    });
    expect(h.sends()).toBe(0);
  });
  it('rechecks revoked grants before executing an approval', async () => {
    const h = await setup();
    await h.deps.grants.replaceAll(h.claims.tenant_id, h.connection.id, [], h.claims.user_id);
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).rejects.toMatchObject({
      code: 'connection_not_found',
    });
    expect(h.sends()).toBe(0);
  });
  it('releases an unexecuted approval after a rate limit so the same review can be retried', async () => {
    const h = await setup();
    vi.spyOn(h.deps.state, 'takeRateSlot').mockResolvedValueOnce(false);
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).rejects.toMatchObject({
      code: 'rate_limited',
    });
    expect(h.sends()).toBe(0);
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).resolves.toMatchObject({
      status: 'ok',
    });
    expect(h.sends()).toBe(1);
  });
  it('never invokes a write again after an uncertain provider outcome', async () => {
    const h = await setup();
    let attempted = 0;
    h.deps.executor.execute = async () => {
      attempted += 1;
      throw new ToolGatewayError('tool_outcome_unknown', 503);
    };
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).rejects.toMatchObject({
      code: 'tool_outcome_unknown',
    });
    await expect(h.gateway.executeApproved(h.approvalId, h.context)).resolves.toMatchObject({
      status: 'error',
      error_code: 'tool_outcome_unknown',
    });
    expect(attempted).toBe(1);
  });
});
