import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RunHub } from '@/server/application/chat/run_hub';
import { SquadTurnService } from '@/server/application/squads/squad_turn_service';
import { StreamRunUseCase } from '@/server/application/use-cases/chat/stream_run_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { passThroughFrameGuard } from '@/server/domain/chat/run_frame_guard';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner, MintContextOptions } from '@/server/domain/context/signed_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import { SQUAD_STARTER_BOUNDS } from '@/server/domain/squads/squad';
import { noTransaction } from '@/server/domain/transactions/transaction_runner';
import { CreateInboxItemUseCase } from '@/server/application/use-cases/inbox/create_inbox_item_use_case';
import { SseParser, type SseFrame } from '@/shared/sse';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import { InMemoryInboxRepository } from './fakes/in_memory_inbox_repository';
import { InMemoryChatRuns, InMemoryMessageCards, InMemoryMessages } from './fakes/in_memory_chat_store';
import { FakeMemberToolPolicy, InMemorySquadTurns, InMemorySquads, SquadConversations } from './fakes/squad_fakes';

const FIXTURES = resolve(import.meta.dirname, 'contract/fixtures');
const fixture = (name: string) => readFileSync(resolve(FIXTURES, name), 'utf8');

const WS = '11111111-1111-4111-8111-111111111111';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HANDLE = 'run_0a1b2c3d-0000-4000-8000-000000000001';
const UPSTREAM_RUN = '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e';
const encoder = new TextEncoder();

const context: RequestContext = {
  user_id: USER,
  workspace_id: WS,
  session_id: 's',
  request_id: 'req-1',
  role: 'member',
  specialist_scope: 'all',
  actor: { type: 'user', id: USER },
};

const bodyOf = (text: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(text));
      c.close();
    },
  });

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
  const parser = new SseParser();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const frames: SseFrame[] = [];
  const take = (items: ReturnType<SseParser['push']>) => {
    for (const item of items) if (item.kind === 'frame') frames.push(item.frame);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    take(parser.push(decoder.decode(value, { stream: true })));
  }
  take(parser.flush());
  return frames;
}

async function harness(opts: { content?: string; agent_slug?: string; kind?: 'squad' | 'hub' } = {}) {
  const squads = new InMemorySquads();
  const squad = await squads.create({
    workspace_id: WS, name: 'Back-office', goal: 'Close the month', lead_type: 'sino', lead_agent_slug: null,
    template_slug: null, limits: null, created_by: USER, member_slugs: ['sinofinance', 'sinopeople'],
  });
  const conversations = new SquadConversations();
  const conversation: ConversationEntity = await conversations.create({
    workspace_id: WS, user_id: USER, kind: opts.kind ?? 'squad', squad_id: opts.kind === 'hub' ? null : squad.id,
  });
  const messages = new InMemoryMessages();
  const userMessage = await messages.create({
    conversation_id: conversation.id, role: 'user', agent_slug: opts.agent_slug ?? 'sino',
    content: opts.content ?? 'Tutup buku bulan ini', run_id: HANDLE, client_message_id: 'a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d',
  });
  const chatRuns = new InMemoryChatRuns();
  const gateway = new FakeAiEngineGateway();
  const turns = new InMemorySquadTurns();
  const audit = new CountingAuditLogger();
  const logged: string[] = [];
  const mints: MintContextOptions[] = [];
  const signer: ContextSigner = {
    mint: vi.fn(async (_c, options) => {
      mints.push(options ?? {});
      return { token: 'signed.context.token', claims: {} as never };
    }),
  };
  const log = { failed: (step: string) => void logged.push(step) };
  const tools = new FakeMemberToolPolicy();
  const squadPort = new SquadTurnService({ squads, turns, tools, audit, log });
  const portSpy = vi.spyOn(squadPort, 'prepare');
  const stream = new StreamRunUseCase({
    conversations,
    messages,
    cards: new InMemoryMessageCards(),
    chatRuns,
    gateway,
    contextSigner: signer,
    hub: new RunHub({ retention_ms: 60_000 }),
    inbox: new CreateInboxItemUseCase({ inbox: new InMemoryInboxRepository(), audit, transactions: noTransaction }),
    guard: passThroughFrameGuard,
    metrics: { record: () => undefined },
    log,
    squads: squadPort,
    sleep: async () => undefined,
    poll_interval_ms: 1,
    replay_deadline_ms: 50,
  });
  return { squads, squad, conversations, conversation, messages, chatRuns, gateway, turns, audit, logged, mints, stream, portSpy, userMessage };
}

const run = async (h: Awaited<ReturnType<typeof harness>>, lastEventId?: string) =>
  collect(await h.stream.execute(HANDLE, { last_event_id: lastEventId }, context));

describe('squad turn through the shared relay (ADR-0044, FR-SQD-07, 11, 13)', () => {
  it('replays the success transcript to the browser in order and stores turn, handoffs and the reply', async () => {
    const h = await harness();
    h.gateway.squadStreamFactory = async () => bodyOf(fixture('squad_sse_transcript_success.txt'));
    const frames = await run(h);
    expect(frames.map((f) => f.event)).toEqual([
      'run_started', 'handoff', 'handoff', 'handoff_result', 'handoff_result', 'token', 'token', 'citation', 'done',
    ]);
    expect(h.gateway.streamRequests).toHaveLength(0);
    expect(h.gateway.squadStreamRequests[0]).toMatchObject({ squadId: h.squad.id, contextToken: 'signed.context.token' });
    expect(h.gateway.squadStreamRequests[0]?.request.user_message).toBe('Tutup buku bulan ini');

    const turn = await h.turns.findByRunHandle(HANDLE);
    expect(turn).toMatchObject({ status: 'completed', termination_reason: 'done', delegation_count: 2, points: 11, ceiling_points: 40 });
    expect(turn?.handoffs.map((x) => [x.to_slug, x.status, x.points])).toEqual([['sinofinance', 'done', 5], ['sinopeople', 'done', 3]]);
    const reply = h.messages.assistantMessages()[0];
    expect(reply?.agent_slug).toBe('sino');
    expect(reply?.content).toContain('12 karyawan');
  });

  it('mints the context with the squad claim and budget from stored data', async () => {
    const h = await harness();
    h.gateway.squadStreamFactory = async () => bodyOf(fixture('squad_sse_transcript_success.txt'));
    await run(h);
    const options = h.mints[0];
    expect(options?.squad?.squad_id).toBe(h.squad.id);
    expect(options?.squad?.members.map((m) => m.agent_slug)).toEqual(['sinofinance', 'sinopeople']);
    expect(options?.budget).toEqual({ max_credits: SQUAD_STARTER_BOUNDS.max_credits, max_tokens: SQUAD_STARTER_BOUNDS.max_tokens });
  });

  it('stores the cap that stopped the turn, audits it once, and keeps the partial answer as a normal reply', async () => {
    const h = await harness();
    h.gateway.squadStreamFactory = async () => bodyOf(fixture('squad_sse_transcript_turn_limit.txt'));
    const frames = await run(h);
    expect(frames.map((f) => f.event)).toContain('turn_limit');
    const turn = await h.turns.findByRunHandle(HANDLE);
    expect(turn).toMatchObject({ status: 'completed', termination_reason: 'cap_credits' });
    expect(h.audit.getEvents().filter((e) => e.action === 'squad.turn.limit_reached')).toHaveLength(1);
    expect(h.messages.assistantMessages()[0]?.status).toBe('completed');
  });

  it('keeps a failed member as a failed handoff and still stores the leads honest answer', async () => {
    const h = await harness();
    h.gateway.squadStreamFactory = async () => bodyOf(fixture('squad_sse_transcript_member_failure.txt'));
    await run(h);
    const turn = await h.turns.findByRunHandle(HANDLE);
    expect(turn?.handoffs[0]).toMatchObject({ to_slug: 'sinofinance', status: 'failed', error_code: 'member_unavailable' });
    expect(turn?.status).toBe('completed');
    expect(h.messages.assistantMessages()[0]?.content).toContain('belum bisa menyelesaikan');
  });

  it('runs a direct @member turn with no ceiling and attributes the reply to that member', async () => {
    const h = await harness({ content: '@SinoFinance berapa runway kita sekarang?', agent_slug: 'sinofinance' });
    h.gateway.squadStreamFactory = async () => bodyOf(fixture('squad_sse_transcript_direct_member.txt'));
    await run(h);
    expect(await h.turns.findByRunHandle(HANDLE)).toMatchObject({ direct_slug: 'sinofinance', ceiling_points: null, handoffs: [] });
    expect(h.messages.assistantMessages()[0]?.agent_slug).toBe('sinofinance');
  });

  it('drops a handoff event that is off contract, logs it, and carries on', async () => {
    const h = await harness();
    h.gateway.squadStreamFactory = async () =>
      bodyOf('id: 1\nevent: handoff\ndata: {"to":"sinofinance"}\n\n' + fixture('squad_sse_transcript_direct_member.txt'));
    const frames = await run(h);
    expect(frames.map((f) => f.event)).not.toContain('handoff');
    expect(h.logged).toContain('squad_frame_failed');
    expect((await h.turns.findByRunHandle(HANDLE))?.handoffs).toEqual([]);
    expect(h.messages.assistantMessages()).toHaveLength(1);
  });

  it('shows the honest error and stores no replacement text when sineva-ai is unreachable', async () => {
    const h = await harness();
    h.gateway.failure = new UpstreamUnavailableError();
    const frames = await run(h);
    expect(frames.map((f) => f.event)).toEqual(['error']);
    expect(JSON.parse(frames[0]!.data)).toMatchObject({ code: 'upstream_unavailable', status: 503, retryable: true });
    expect(h.messages.assistantMessages()).toHaveLength(0);
    // Retry can start a fresh run on the same handle.
    expect((await h.chatRuns.findByHandle(HANDLE))?.status).toBe('pending');
  });

  it('refuses to start when the squad was archived after the message was stored', async () => {
    const h = await harness();
    await h.squads.update(WS, h.squad.id, { status: 'archived' });
    const frames = await run(h);
    expect(JSON.parse(frames[0]!.data)).toMatchObject({ code: 'squad_unavailable', retryable: false });
    expect(h.gateway.squadStreamRequests).toHaveLength(0);
  });

  it('maps a person who lost access to a forbidden error, not a generic one', async () => {
    const h = await harness();
    const frames = await collect(
      await h.stream.execute(HANDLE, {}, { ...context, specialist_scope: 'selected', allowed_specialists: ['sinofinance'] }),
    );
    expect(JSON.parse(frames[0]!.data)).toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('serves a later attach from the stored events and does not duplicate handoffs', async () => {
    const h = await harness();
    h.gateway.squadStreamFactory = async () => bodyOf(fixture('squad_sse_transcript_success.txt'));
    await run(h);
    const parser = new SseParser();
    const events = [...parser.push(fixture('squad_sse_transcript_success.txt')), ...parser.flush()].flatMap((i) =>
      i.kind === 'frame' ? [{ id: i.frame.id, event: i.frame.event, data: JSON.parse(i.frame.data) }] : [],
    );
    h.gateway.runEvents = events;
    await h.chatRuns.recordUpstream((await h.chatRuns.findByHandle(HANDLE))!.id, { upstream_run_id: UPSTREAM_RUN });
    const again = await run(h, '0');
    expect(again.map((f) => f.event)).toContain('handoff');
    expect((await h.turns.findByRunHandle(HANDLE))?.handoffs).toHaveLength(2);
  });

  it('leaves Hub runs alone: no squad port call, the agent stream is used', async () => {
    const h = await harness({ kind: 'hub', agent_slug: 'sinofinance' });
    await run(h);
    expect(h.portSpy).not.toHaveBeenCalled();
    expect(h.gateway.streamRequests).toHaveLength(1);
    expect(h.gateway.squadStreamRequests).toHaveLength(0);
  });
});
