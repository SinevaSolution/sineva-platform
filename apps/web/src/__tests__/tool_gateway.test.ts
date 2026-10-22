import { describe, expect, it, vi } from 'vitest';
import { ExecuteToolUseCase } from '@/server/application/toolgateway/execute_tool_use_case';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
import { ConnectorRegistry } from '@/server/application/connections/connector_registry';
import { PROVIDER_MANIFESTS } from '@/server/application/connections/manifests';
import type { GatewayDeps, GatewayRequest } from '@/server/domain/toolgateway/gateway_ports';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { GatewayContext } from '@/server/domain/toolgateway/gateway_context';
import { InMemoryConnectionRepository } from './fakes/in_memory_connection_repository';
import { InMemoryConnectionGrantRepository } from './fakes/in_memory_connection_grant_repository';
const run = 'run_33333333-3333-4333-8333-333333333333';
const claims: GatewayContext = {
  iss: 'sineva-platform',
  aud: 'sineva-ai',
  jti: 'j1',
  iat: 1,
  exp: 61,
  tenant_id: 'w1',
  user_id: 'u1',
  role: 'member',
  agent_slug: 'sinosales',
  allowed_agents: ['sinosales'],
  run_id: run,
  request_id: 'r1',
  locale: 'en',
  allowed_tools: ['gmail_get_message', 'gmail_send_message'],
  skill_tools: ['gmail_get_message', 'gmail_send_message'],
  trifecta: { private_data: true, untrusted_content: true, send: true },
};
const request: GatewayRequest = {
  tool_name: 'gmail_get_message',
  arguments: { message_id: 'm1' },
  run_id: run,
  call_id: 'c1',
  mode: 'live',
};
async function setup() {
  const connections = new InMemoryConnectionRepository();
  const connection = await connections.create({
    workspace_id: 'w1',
    provider_id: 'gmail',
    owner_scope: 'workspace',
    owner_user_id: null,
    created_by_user_id: 'u1',
    auth_type: 'oauth2_pkce',
    status: 'connected',
    scope_bundle: 'email_compose',
    requested_scopes: [],
    granted_scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
    external_account_id: 'acct1',
    account_label: 'me@example.com',
    access_expires_at: null,
    refresh_expires_at: null,
  });
  const grants = new InMemoryConnectionGrantRepository();
  await grants.replaceAll(
    'w1',
    connection.id,
    [{ agent_slug: 'sinosales', access_level: 'write' }],
    'u1',
  );
  const audit = new CountingAuditLogger();
  const state = {
    releaseUnexecuted: vi.fn(async () => {}),
    loadApprovalCall: vi.fn(),
    claimApproved: vi.fn(),
    authorize: vi.fn(async () => ({
      user_id: 'u1',
      workspace_id: 'w1',
      role: 'member' as const,
      session_id: 'internal',
      request_id: 'r1',
    })),
    isBlocked: vi.fn(async () => false),
    claim: vi.fn(async () => ({ status: 'claimed' as const, id: 'tc1' })),
    finish: vi.fn(async () => {}),
    takeRateSlot: vi.fn(async () => true),
  };
  const executor = {
    supports: () => true,
    endpoint: () => 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    execute: vi.fn(async () => ({
      id: 'm1',
      thread_id: 't1',
      from: 'me@example.com',
      subject: 'Hello',
      snippet: 'safe',
      received_at: '2023-11-14T22:13:20Z',
      to: ['you@example.com'],
      body_text: 'Safe text',
    })),
  };
  const deps: GatewayDeps = {
    verifier: { verify: vi.fn(async () => structuredClone(claims)) },
    state,
    registry: new ConnectorRegistry(PROVIDER_MANIFESTS, {
      credentialsAvailable: () => true,
      specialistsFor: () => ['sinosales'],
    }),
    connections,
    grants,
    credentials: {
      forConnection: vi.fn(async () => ({
        credentials: { access_token: 'private-token' },
        connection,
      })),
    },
    executor,
    transactions: { run: async (fn) => fn() },
    approvals: { create: vi.fn(async () => 'approval1') },
    audit,
    redact: (v) => v,
  };
  return { deps, audit, state, executor, connection, useCase: new ExecuteToolUseCase(deps) };
}
describe('Tool Gateway enforcement', () => {
  it('requires approval under the stored ask_every_time policy before reading secrets', async () => {
    const { deps, useCase } = await setup();
    await expect(useCase.execute(request, 'token')).resolves.toMatchObject({
      status: 'approval_required',
      approval_id: 'approval1',
    });
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
    expect(deps.executor.execute).not.toHaveBeenCalled();
  });
  it('refuses a run different from the signed run', async () => {
    const { deps, useCase } = await setup();
    await expect(
      useCase.execute({ ...request, run_id: 'run_other' }, 'token'),
    ).rejects.toMatchObject({ code: 'action_not_allowed' });
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
  });
  it.each(['allowed_tools', 'skill_tools'] as const)('refuses widening beyond %s', async (key) => {
    const { deps, useCase, audit } = await setup();
    deps.verifier.verify = async () => ({ ...claims, [key]: [] });
    await expect(useCase.execute(request, 'token')).rejects.toMatchObject({
      code: 'action_not_allowed',
    });
    expect(audit.getEvents().at(-1)?.action).toBe('connection.tool_denied');
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
  });
  it('blocks a frozen workspace before reserving a call or touching credentials', async () => {
    const { useCase, deps, state } = await setup();
    state.isBlocked.mockResolvedValue(true);
    await expect(useCase.execute(request, 'token')).rejects.toMatchObject({
      code: 'kill_switch_active',
    });
    expect(state.claim).not.toHaveBeenCalled();
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
  });
  it('does not expose a personal connection owned by someone else', async () => {
    const { deps, useCase, connection } = await setup();
    vi.spyOn(deps.connections, 'listVisible').mockResolvedValue([
      { ...connection, owner_scope: 'user', owner_user_id: 'another-user' },
    ]);
    await expect(useCase.execute(request, 'token')).rejects.toMatchObject({
      code: 'connection_not_found',
    });
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
  });
  it('refuses writes with only a read grant', async () => {
    const { deps, useCase, connection } = await setup();
    await deps.grants.replaceAll(
      'w1',
      connection.id,
      [{ agent_slug: 'sinosales', access_level: 'read' }],
      'u1',
    );
    await expect(
      useCase.execute(
        {
          ...request,
          tool_name: 'gmail_send_message',
          arguments: { to: ['you@example.com'], subject: 'Hi', body_text: 'Hello' },
        },
        'token',
      ),
    ).rejects.toMatchObject({ code: 'action_not_allowed' });
  });
  it('simulates a write without calling the provider, vault or approval creator', async () => {
    const { deps, useCase } = await setup();
    const result = await useCase.execute(
      {
        ...request,
        mode: 'simulate',
        tool_name: 'gmail_send_message',
        arguments: { to: ['you@example.com'], subject: 'Hi', body_text: 'Hello' },
      },
      'token',
    );
    expect(result).toMatchObject({
      status: 'ok',
      result: { simulated: true, action: 'gmail_send_message', to: ['you@example.com'] },
    });
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
    expect(deps.approvals.create).not.toHaveBeenCalled();
  });
  it('requires an idempotency key before a live external write', async () => {
    const { useCase } = await setup();
    await expect(
      useCase.execute(
        {
          ...request,
          tool_name: 'gmail_send_message',
          arguments: { to: ['you@example.com'], subject: 'Hi', body_text: 'Hello' },
        },
        'token',
      ),
    ).rejects.toMatchObject({ code: 'idempotency_key_required' });
  });
  it('returns the first result for an idempotent replay', async () => {
    const { state, useCase, executor } = await setup();
    state.claim.mockResolvedValue({
      status: 'replay',
      response: { status: 'ok', result: { message_id: 'already-sent' }, error_code: null },
    } as never);
    await expect(useCase.execute(request, 'token')).resolves.toMatchObject({
      result: { message_id: 'already-sent' },
    });
    expect(executor.execute).not.toHaveBeenCalled();
  });
  it('does not audit arguments or token content', async () => {
    const { useCase, audit } = await setup();
    await useCase.execute(request, 'token');
    const events = JSON.stringify(audit.getEvents());
    expect(events).not.toContain('private-token');
    expect(events).not.toContain('message_id');
    expect(events).toContain('sha256:');
  });
  it('refuses the call when current membership authorization fails', async () => {
    const { useCase, state, deps } = await setup();
    state.authorize.mockRejectedValue(new ToolGatewayError('action_not_allowed'));
    await expect(useCase.execute(request, 'token')).rejects.toMatchObject({
      code: 'action_not_allowed',
    });
    expect(deps.credentials.forConnection).not.toHaveBeenCalled();
  });
  it.each(['rate_limited', 'egress_denied'])(
    'fails at %s before resolving credentials',
    async (code) => {
      const { deps, state, useCase } = await setup();
      const list = deps.grants.listByConnection.bind(deps.grants);
      vi.spyOn(deps.grants, 'listByConnection').mockImplementation(async (w, c) =>
        (await list(w, c)).map((g) => ({ ...g, approval_policy: 'ask_for_writes' })),
      );
      if (code === 'rate_limited') state.takeRateSlot.mockResolvedValue(false);
      else deps.registry.isEgressAllowed = () => false;
      await expect(useCase.execute(request, 'token')).rejects.toMatchObject({ code });
      expect(deps.credentials.forConnection).not.toHaveBeenCalled();
      expect(state.releaseUnexecuted).toHaveBeenCalledWith('tc1');
    },
  );
  it('reads, redacts and marks external content as untrusted', async () => {
    const { deps, executor, useCase, audit } = await setup();
    const list = deps.grants.listByConnection.bind(deps.grants);
    vi.spyOn(deps.grants, 'listByConnection').mockImplementation(async (w, c) =>
      (await list(w, c)).map((g) => ({ ...g, approval_policy: 'ask_for_writes' })),
    );
    deps.redact = (v) => ({ ...v, body_text: '[REDACTED]' });
    await expect(useCase.execute(request, 'token')).resolves.toMatchObject({
      status: 'ok',
      result: { body_text: '[REDACTED]', untrusted: true },
    });
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(audit.getEvents().some((e) => e.action === 'connection.tool_called')).toBe(true);
  });
  it('does not call the provider if the admission audit cannot be written', async () => {
    const { deps, executor, useCase } = await setup();
    const list = deps.grants.listByConnection.bind(deps.grants);
    vi.spyOn(deps.grants, 'listByConnection').mockImplementation(async (w, c) =>
      (await list(w, c)).map((g) => ({ ...g, approval_policy: 'ask_for_writes' })),
    );
    deps.audit.log = async () => {
      throw new Error('audit unavailable');
    };
    await expect(useCase.execute(request, 'token')).rejects.toThrow('audit unavailable');
    expect(executor.execute).not.toHaveBeenCalled();
  });
  it('returns a typed truncation marker above the action response cap', async () => {
    const { deps, useCase } = await setup();
    const list = deps.grants.listByConnection.bind(deps.grants);
    vi.spyOn(deps.grants, 'listByConnection').mockImplementation(async (w, c) =>
      (await list(w, c)).map((g) => ({ ...g, approval_policy: 'ask_for_writes' })),
    );
    const action = deps.registry.action(request.tool_name)!;
    vi.spyOn(deps.registry, 'action').mockReturnValue({ ...action, max_response_bytes: 10 });
    await expect(useCase.execute(request, 'token')).resolves.toMatchObject({
      result: { truncated: true, error_code: 'response_truncated', untrusted: true },
    });
  });
});
