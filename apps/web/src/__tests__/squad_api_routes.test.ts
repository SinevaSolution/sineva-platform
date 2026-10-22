import { installHeaderSessionResolver } from './fakes/header_session_resolver';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as squadsRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/route';
import * as squadRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/route';
import * as membersRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/members/route';
import * as accessRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/access/route';
import * as sessionsRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/sessions/route';
import * as sessionRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/sessions/[session_id]/route';
import * as messagesRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/sessions/[session_id]/messages/route';
import * as activityRoute from '@/app/api/v1/workspaces/[workspace_id]/squads/[squad_id]/activity/route';
import * as templatesRoute from '@/app/api/v1/workspaces/[workspace_id]/squad-templates/route';
import * as useTemplateRoute from '@/app/api/v1/workspaces/[workspace_id]/squad-templates/[slug]/use/route';
import * as container from '@/server/container';
import type { SquadChatDeps } from '@/server/application/squads/squad_chat_support';
import type { SquadDeps } from '@/server/application/squads/squad_support';
import { CreateSquadMessageUseCase } from '@/server/application/use-cases/squads/create_squad_message_use_case';
import { CreateSquadSessionUseCase } from '@/server/application/use-cases/squads/create_squad_session_use_case';
import { CreateSquadUseCase } from '@/server/application/use-cases/squads/create_squad_use_case';
import { DeleteSquadUseCase } from '@/server/application/use-cases/squads/delete_squad_use_case';
import { GetSquadSessionUseCase } from '@/server/application/use-cases/squads/get_squad_session_use_case';
import { GetSquadUseCase } from '@/server/application/use-cases/squads/get_squad_use_case';
import { ListSquadActivityUseCase } from '@/server/application/use-cases/squads/list_squad_activity_use_case';
import { ListSquadSessionsUseCase } from '@/server/application/use-cases/squads/list_squad_sessions_use_case';
import { ListSquadTemplatesUseCase } from '@/server/application/use-cases/squads/list_squad_templates_use_case';
import { ListSquadsUseCase } from '@/server/application/use-cases/squads/list_squads_use_case';
import { SetSquadAccessUseCase } from '@/server/application/use-cases/squads/set_squad_access_use_case';
import { SetSquadMembersUseCase } from '@/server/application/use-cases/squads/set_squad_members_use_case';
import { UpdateSquadUseCase } from '@/server/application/use-cases/squads/update_squad_use_case';
import { UseSquadTemplateUseCase } from '@/server/application/use-cases/squads/use_squad_template_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { noTransaction } from '@/server/domain/transactions/transaction_runner';
import { allowAllEntitlements } from './fakes/allow_all_entitlements';
import { InMemoryMessages } from './fakes/in_memory_chat_store';
import { FakeSquadDirectory, InMemorySquadTurns, InMemorySquads, SquadConversations } from './fakes/squad_fakes';

installHeaderSessionResolver();

// The templates route reads the request language from cookies and headers, which
// only exist inside a Next request. The language itself is covered in the use case test.
vi.mock('@/i18n/server', () => ({ getLocale: async () => 'en' }));

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SQUAD = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const base = (workspace = WS) => `https://app.sineva.id/api/v1/workspaces/${workspace}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (request: NextRequest, context: any) => Promise<Response>;

interface RouteCase {
  name: string;
  handler: RouteHandler;
  method: string;
  path: string;
  params?: Record<string, string>;
  body?: unknown;
  /** The lowest-privilege role that must be refused (403), or null when every role may call it. */
  deniedRole: 'viewer' | 'member' | null;
}

const P = { squad_id: SQUAD, session_id: SESSION };
const CASES: RouteCase[] = [
  { name: 'GET squads', handler: squadsRoute.GET, method: 'GET', path: '/squads', deniedRole: null },
  { name: 'POST squads', handler: squadsRoute.POST, method: 'POST', path: '/squads', body: {}, deniedRole: 'viewer' },
  { name: 'GET squad', handler: squadRoute.GET, method: 'GET', path: `/squads/${SQUAD}`, params: P, deniedRole: null },
  { name: 'PATCH squad', handler: squadRoute.PATCH, method: 'PATCH', path: `/squads/${SQUAD}`, params: P, body: { name: 'x' }, deniedRole: 'viewer' },
  { name: 'DELETE squad', handler: squadRoute.DELETE, method: 'DELETE', path: `/squads/${SQUAD}`, params: P, deniedRole: 'member' },
  { name: 'PUT members', handler: membersRoute.PUT, method: 'PUT', path: `/squads/${SQUAD}/members`, params: P, body: { member_slugs: [] }, deniedRole: 'viewer' },
  { name: 'PUT access', handler: accessRoute.PUT, method: 'PUT', path: `/squads/${SQUAD}/access`, params: P, body: { user_id: OTHER, granted: true }, deniedRole: 'member' },
  { name: 'GET sessions', handler: sessionsRoute.GET, method: 'GET', path: `/squads/${SQUAD}/sessions`, params: P, deniedRole: null },
  { name: 'POST sessions', handler: sessionsRoute.POST, method: 'POST', path: `/squads/${SQUAD}/sessions`, params: P, body: {}, deniedRole: 'viewer' },
  { name: 'GET session', handler: sessionRoute.GET, method: 'GET', path: `/squads/${SQUAD}/sessions/${SESSION}`, params: P, deniedRole: null },
  { name: 'POST messages', handler: messagesRoute.POST, method: 'POST', path: `/squads/${SQUAD}/sessions/${SESSION}/messages`, params: P, body: { content: 'hi' }, deniedRole: 'viewer' },
  { name: 'GET activity', handler: activityRoute.GET, method: 'GET', path: `/squads/${SQUAD}/activity`, params: P, deniedRole: null },
  { name: 'GET squad-templates', handler: templatesRoute.GET, method: 'GET', path: '/squad-templates', deniedRole: null },
  { name: 'POST squad-templates use', handler: useTemplateRoute.POST, method: 'POST', path: '/squad-templates/launch/use', params: { slug: 'launch' }, body: {}, deniedRole: 'viewer' },
];

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-test-session-user-id': USER,
    'x-test-session-role': 'admin',
    'x-test-session-workspaces': WS,
    ...extra,
  };
}

function call(
  handler: RouteHandler,
  method: string,
  path: string,
  options: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string>; workspace?: string } = {},
) {
  const workspace = options.workspace ?? WS;
  const request = new NextRequest(`${base(workspace)}${path}`, {
    method,
    headers: headers(options.headers),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return handler(request, { params: Promise.resolve({ workspace_id: workspace, ...options.params }) });
}

let squads: InMemorySquads;
let directory: FakeSquadDirectory;
let audit: CountingAuditLogger;
let conversations: SquadConversations;
let turns: InMemorySquadTurns;
let messages: InMemoryMessages;

beforeEach(() => {
  vi.restoreAllMocks();
  squads = new InMemorySquads();
  directory = new FakeSquadDirectory();
  audit = new CountingAuditLogger();
  conversations = new SquadConversations();
  turns = new InMemorySquadTurns();
  messages = new InMemoryMessages();
  const deps: SquadDeps = {
    squads,
    directory,
    audit,
    entitlements: allowAllEntitlements,
    transactions: noTransaction,
    members: { findMembership: async (_ws: string, user: string) => ({ id: 'm', user_id: user }) as never },
  };
  const chat: SquadChatDeps = {
    squads,
    directory,
    audit,
    transactions: noTransaction,
    conversations,
    messages,
    turns,
    listMessages: { execute: async (id: string) => ({ items: messages.rows.filter((m) => m.conversation_id === id).map((m) => ({ ...m, cards: [] })), next_cursor: null }) },
  };
  const create = new CreateSquadUseCase(deps);
  vi.spyOn(container, 'getListSquadsUseCase').mockReturnValue(new ListSquadsUseCase(deps));
  vi.spyOn(container, 'getGetSquadUseCase').mockReturnValue(new GetSquadUseCase(deps));
  vi.spyOn(container, 'getCreateSquadUseCase').mockReturnValue(create);
  vi.spyOn(container, 'getUpdateSquadUseCase').mockReturnValue(new UpdateSquadUseCase(deps));
  vi.spyOn(container, 'getSetSquadMembersUseCase').mockReturnValue(new SetSquadMembersUseCase(deps));
  vi.spyOn(container, 'getDeleteSquadUseCase').mockReturnValue(new DeleteSquadUseCase(deps));
  vi.spyOn(container, 'getSetSquadAccessUseCase').mockReturnValue(new SetSquadAccessUseCase(deps));
  vi.spyOn(container, 'getListSquadTemplatesUseCase').mockReturnValue(new ListSquadTemplatesUseCase());
  vi.spyOn(container, 'getUseSquadTemplateUseCase').mockReturnValue(new UseSquadTemplateUseCase(create));
  vi.spyOn(container, 'getCreateSquadSessionUseCase').mockReturnValue(new CreateSquadSessionUseCase(chat));
  vi.spyOn(container, 'getListSquadSessionsUseCase').mockReturnValue(new ListSquadSessionsUseCase(chat));
  vi.spyOn(container, 'getGetSquadSessionUseCase').mockReturnValue(new GetSquadSessionUseCase(chat));
  vi.spyOn(container, 'getCreateSquadMessageUseCase').mockReturnValue(new CreateSquadMessageUseCase(chat));
  vi.spyOn(container, 'getListSquadActivityUseCase').mockReturnValue(new ListSquadActivityUseCase(chat));
});

describe.each(CASES)('$name: guards (401, 403, cross-workspace 404)', (route) => {
  it('returns 401 without a session', async () => {
    const res = await call(route.handler, route.method, route.path, { params: route.params, body: route.body, headers: { 'x-test-unauthenticated': 'true' } });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a workspace the caller is not a member of, never 403', async () => {
    const res = await call(route.handler, route.method, route.path, { params: route.params, body: route.body, workspace: OTHER_WS });
    expect(res.status).toBe(404);
  });

  if (route.deniedRole) {
    it(`returns 403 for the ${route.deniedRole} role`, async () => {
      const res = await call(route.handler, route.method, route.path, { params: route.params, body: route.body, headers: { 'x-test-session-role': route.deniedRole! } });
      expect(res.status).toBe(403);
    });
  }
});

const create = (over: Record<string, unknown> = {}, extra: Record<string, string> = {}) =>
  call(squadsRoute.POST, 'POST', '/squads', {
    body: { name: 'Back-office', goal: 'Keep the month on track', member_slugs: ['sinofinance', 'sinopeople'], ...over },
    headers: extra,
  });

describe('squad routes end to end over the fakes', () => {
  it('creates (201) a squad and serves a view without the workspace id, and lists it', async () => {
    const res = await create();
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({
      name: 'Back-office',
      lead_type: 'sino',
      status: 'active',
      my_access: 'open',
      can_edit: true,
      members: [{ agent_slug: 'sinofinance', position: 0 }, { agent_slug: 'sinopeople', position: 1 }],
      attention: [],
    });
    expect(JSON.stringify(json)).not.toContain(WS);
    const list = await (await call(squadsRoute.GET, 'GET', '/squads')).json();
    expect(list.data.items).toHaveLength(1);
  });

  it('never trusts a workspace id or creator from the body (the schema is strict)', async () => {
    const res = await create({ workspace_id: OTHER_WS, created_by: OTHER });
    expect(res.status).toBe(422);
    expect(squads.rows.size).toBe(0);
  });

  it('answers 422 naming the member limit for one member', async () => {
    const res = await create({ member_slugs: ['sinofinance'] });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0]).toMatchObject({ code: 'squad_members_count' });
  });

  it('answers 503, not a made-up squad, when sineva-ai cannot be reached', async () => {
    directory.down();
    const res = await create();
    expect(res.status).toBe(503);
    expect(squads.rows.size).toBe(0);
  });

  it('patches, replaces members, grants an override, archives and deletes', async () => {
    const { data } = await (await create()).json();
    const params = { squad_id: data.id };
    const renamed = await call(squadRoute.PATCH, 'PATCH', `/squads/${data.id}`, { params, body: { name: 'Month end' } });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).data.name).toBe('Month end');

    const members = await call(membersRoute.PUT, 'PUT', `/squads/${data.id}/members`, { params, body: { member_slugs: ['sinofinance', 'sinosales', 'sinohelp'] } });
    expect(members.status).toBe(200);
    expect((await members.json()).data.members.map((m: { agent_slug: string }) => m.agent_slug)).toEqual(['sinofinance', 'sinosales', 'sinohelp']);

    const access = await call(accessRoute.PUT, 'PUT', `/squads/${data.id}/access`, { params, body: { user_id: OTHER, granted: true } });
    expect(access.status).toBe(200);

    const archived = await call(squadRoute.PATCH, 'PATCH', `/squads/${data.id}`, { params, body: { status: 'archived' } });
    expect((await archived.json()).data.status).toBe('archived');
    const edit = await call(squadRoute.PATCH, 'PATCH', `/squads/${data.id}`, { params, body: { name: 'No' } });
    expect(edit.status).toBe(422);

    const removed = await call(squadRoute.DELETE, 'DELETE', `/squads/${data.id}`, { params });
    expect(removed.status).toBe(200);
    expect((await call(squadRoute.GET, 'GET', `/squads/${data.id}`, { params })).status).toBe(404);
    expect(audit.getEvents().map((e) => e.action)).toEqual(
      expect.arrayContaining(['squad.created', 'squad.updated', 'squad.member_added', 'squad.member_removed', 'squad.access_overridden', 'squad.archived', 'squad.deleted']),
    );
  });

  it('reads another workspace squad as 404', async () => {
    const { data } = await (await create()).json();
    const res = await call(squadRoute.GET, 'GET', `/squads/${data.id}`, { params: { squad_id: data.id }, headers: { 'x-test-session-workspaces': `${WS},${OTHER_WS}` }, workspace: OTHER_WS });
    expect(res.status).toBe(404);
  });

  it('lists templates and uses one, with only released specialists', async () => {
    const list = await (await call(templatesRoute.GET, 'GET', '/squad-templates')).json();
    expect(list.data.items.map((t: { slug: string }) => t.slug)).toEqual(['launch', 'back_office', 'customer']);
    expect(JSON.stringify(list)).not.toMatch(/sinowrite|sinotax|sinoops|sinoshop/);
    const used = await call(useTemplateRoute.POST, 'POST', '/squad-templates/customer/use', { params: { slug: 'customer' }, body: { name: 'Toko' } });
    expect(used.status).toBe(201);
    expect((await used.json()).data).toMatchObject({ name: 'Toko', template_slug: 'customer' });
    const unknown = await call(useTemplateRoute.POST, 'POST', '/squad-templates/nope/use', { params: { slug: 'nope' }, body: {} });
    expect(unknown.status).toBe(404);
  });

  it('opens a session, sends a message and returns the ceiling; a direct @member returns none', async () => {
    const { data } = await (await create()).json();
    const params = { squad_id: data.id };
    const session = await call(sessionsRoute.POST, 'POST', `/squads/${data.id}/sessions`, { params, body: {} });
    expect(session.status).toBe(201);
    const sid = (await session.json()).data.id as string;
    const p = { ...params, session_id: sid };
    const sent = await call(messagesRoute.POST, 'POST', `/squads/${data.id}/sessions/${sid}/messages`, { params: p, body: { content: 'Close the month' } });
    const sentJson = await sent.json();
    expect(sent.status).toBe(201);
    expect(sentJson.data.run_id).toMatch(/^run_/);
    expect(sentJson.data.ceiling_points).toBeGreaterThan(0);
    const direct = await call(messagesRoute.POST, 'POST', `/squads/${data.id}/sessions/${sid}/messages`, { params: p, body: { content: '@SinoFinance runway?' } });
    expect((await direct.json()).data.ceiling_points).toBeNull();
    const notMember = await call(messagesRoute.POST, 'POST', `/squads/${data.id}/sessions/${sid}/messages`, { params: p, body: { content: '@SinoSales draft' } });
    expect(notMember.status).toBe(422);
    expect((await notMember.json()).errors[0]).toMatchObject({ code: 'mention_not_in_squad' });

    const detail = await (await call(sessionRoute.GET, 'GET', `/squads/${data.id}/sessions/${sid}`, { params: p })).json();
    expect(detail.data.messages).toHaveLength(2);
    expect(detail.data.turns).toEqual([]);
    const activity = await call(activityRoute.GET, 'GET', `/squads/${data.id}/activity`, { params });
    expect(activity.status).toBe(200);
  });

  it('keeps sessions private: another member gets 404 for someone elses session', async () => {
    const { data } = await (await create()).json();
    const session = await call(sessionsRoute.POST, 'POST', `/squads/${data.id}/sessions`, { params: { squad_id: data.id }, body: {} });
    const sid = (await session.json()).data.id as string;
    const res = await call(sessionRoute.GET, 'GET', `/squads/${data.id}/sessions/${sid}`, {
      params: { squad_id: data.id, session_id: sid },
      headers: { 'x-test-session-user-id': OTHER, 'x-test-session-role': 'member' },
    });
    expect(res.status).toBe(404);
  });

  it('shows Ask an admin to a member limited to some specialists and 403 when they try to chat', async () => {
    const { data } = await (await create()).json();
    const restricted = { 'x-test-session-user-id': OTHER, 'x-test-session-role': 'member', 'x-test-specialist-scope': 'selected', 'x-test-session-specialists': 'sinofinance,sinopeople,sinosales' };
    const seen = await call(squadRoute.GET, 'GET', `/squads/${data.id}`, { params: { squad_id: data.id }, headers: { ...restricted, 'x-test-session-specialists': 'sinofinance' } });
    expect((await seen.json()).data.my_access).toBe('ask_admin');
    const open = await call(sessionsRoute.POST, 'POST', `/squads/${data.id}/sessions`, { params: { squad_id: data.id }, body: {}, headers: { ...restricted, 'x-test-session-specialists': 'sinofinance' } });
    expect(open.status).toBe(403);
  });
});
