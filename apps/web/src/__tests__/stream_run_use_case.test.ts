import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunHub } from '@/server/application/chat/run_hub';
import { CancelRunUseCase } from '@/server/application/use-cases/chat/cancel_run_use_case';
import { StreamRunUseCase } from '@/server/application/use-cases/chat/stream_run_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RunFrameGuard } from '@/server/domain/chat/run_frame_guard';
import { passThroughFrameGuard } from '@/server/domain/chat/run_frame_guard';
import type { RunLatencySample } from '@/server/domain/chat/run_metrics';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import {
  DomainError,
  NotFoundError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';
import { parseSseTranscript } from '@/server/application/dtos/chat_v2_dto';
import { SseParser, type SseFrame, type SseItem } from '@/shared/sse';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import {
  InMemoryChatRuns,
  InMemoryConversations,
  InMemoryMessages,
} from './fakes/in_memory_chat_store';

const FIXTURES = resolve(import.meta.dirname, 'contract/fixtures');
const fixture = (name: string) => readFileSync(resolve(FIXTURES, name), 'utf8');

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';
const USER = 'user-alpha';
const HANDLE = 'run_0a1b2c3d-0000-4000-8000-000000000001';
const UPSTREAM_RUN = '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e';
const UPSTREAM_SESSION = '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3';
const USER_CLIENT_ID = 'a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d';

const context = (over: Partial<RequestContext> = {}): RequestContext => ({
  user_id: USER,
  workspace_id: WS,
  session_id: 'sess-1',
  request_id: 'req-1',
  actor: { type: 'user', id: USER },
  ...over,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** An upstream body the test feeds by hand, to prove nothing is buffered. */
function controlled() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: (error: Error) => controller.error(error),
  };
}

function bodyOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(text));
      c.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseItem[]> {
  const parser = new SseParser();
  const reader = stream.getReader();
  const items: SseItem[] = [];
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    items.push(...parser.push(dec.decode(value, { stream: true })));
  }
  items.push(...parser.flush());
  return items;
}

const framesOf = (items: SseItem[]): SseFrame[] =>
  items.flatMap((i) => (i.kind === 'frame' ? [i.frame] : []));

const fixtureFrames = (name: string): SseFrame[] => {
  const parser = new SseParser();
  return framesOf([...parser.push(fixture(name)), ...parser.flush()]);
};

async function harness(over: { guard?: RunFrameGuard; now?: () => number } = {}) {
  const conversations = new InMemoryConversations();
  const conversation: ConversationEntity = {
    id: CONV,
    workspace_id: WS,
    user_id: USER,
    kind: 'hub',
    agent_slug: null,
    title: null,
    title_source: null,
    pinned_at: null,
    archived_at: null,
    origin_message_id: null,
    origin_channel: 'web',
    last_message_at: null,
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
  };
  conversations.rows.set(CONV, conversation);

  const messages = new InMemoryMessages();
  const userMessage = await messages.create({
    conversation_id: CONV,
    role: 'user',
    agent_slug: 'sinofinance',
    content: '@SinoFinance hitung runway kami',
    mentions: [{ agent_slug: 'sinofinance' }],
    run_id: HANDLE,
    client_message_id: USER_CLIENT_ID,
  });

  const chatRuns = new InMemoryChatRuns();
  const gateway = new FakeAiEngineGateway();
  const hub = new RunHub({ retention_ms: 60_000 });
  const samples: RunLatencySample[] = [];
  const signer: ContextSigner = {
    mint: vi.fn(async () => ({ token: 'signed.context.token', claims: {} as never })),
  };
  const audit = new CountingAuditLogger();

  const stream = new StreamRunUseCase({
    conversations,
    messages,
    chatRuns,
    gateway,
    contextSigner: signer,
    hub,
    guard: over.guard ?? passThroughFrameGuard,
    metrics: { record: (s) => samples.push(s) },
    now: over.now,
    sleep: async () => undefined,
    poll_interval_ms: 1,
    replay_deadline_ms: 50,
  });
  const cancel = new CancelRunUseCase({
    conversations,
    messages,
    chatRuns,
    gateway,
    contextSigner: signer,
    hub,
    audit,
  });

  return { conversations, messages, chatRuns, gateway, hub, samples, signer, audit, stream, cancel, userMessage };
}

describe('StreamRunUseCase relay (WP-M0-30, FR-AIR-11, FR-AIR-12, FR-HUB-20)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('relay contract (sse_transcript_text_only.txt)', () => {
    it('forwards the transcript to the browser with identical events, order and ids, and stores the assistant message on done', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_text_only.txt'));

      const out = await collect(await h.stream.execute(HANDLE, {}, context()));

      expect(framesOf(out)).toEqual(fixtureFrames('sse_transcript_text_only.txt'));

      const stored = h.messages.assistantMessages();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        conversation_id: CONV,
        role: 'assistant',
        content: 'Halo! Ada yang bisa dibantu?',
        status: 'completed',
        finish_reason: 'stop',
        run_id: HANDLE,
        agent_slug: 'sino',
      });
      const run = h.chatRuns.get(HANDLE);
      expect(run).toMatchObject({
        status: 'completed',
        upstream_run_id: UPSTREAM_RUN,
        upstream_session_id: UPSTREAM_SESSION,
        assistant_message_id: stored[0]!.id,
      });
      expect(h.conversations.lastMessageAtUpdates).toBe(1);
    });

    it('the message already exists when the browser receives done', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_text_only.txt'));
      const reader = (await h.stream.execute(HANDLE, {}, context())).getReader();
      const parser = new SseParser();
      let seenDone = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const item of parser.push(decoder.decode(value, { stream: true }))) {
          if (item.kind === 'frame' && item.frame.event === 'done') {
            seenDone = true;
            expect(h.messages.assistantMessages()).toHaveLength(1);
          }
        }
      }
      expect(seenDone).toBe(true);
    });

    it('builds the v2 request from the stored message: client_message_id, mention spans, no session on the first turn', async () => {
      const h = await harness();
      await collect(await h.stream.execute(HANDLE, {}, context()));

      expect(h.gateway.streamRequests).toHaveLength(1);
      const call = h.gateway.streamRequests[0]!;
      expect(call.agentSlug).toBe('sinofinance');
      expect(call.contextToken).toBe('signed.context.token');
      expect(call.request).toEqual({
        user_message: '@SinoFinance hitung runway kami',
        session_id: null,
        client_message_id: USER_CLIENT_ID,
        mentions: [{ agent_slug: 'sinofinance', start: 0, end: 12 }],
        attachments: [],
        use_library: false,
        allow_degraded: false,
      });
    });

    it('reuses the stored sineva-ai session for the next turn of the conversation', async () => {
      const h = await harness();
      await collect(await h.stream.execute(HANDLE, {}, context()));

      const second = 'run_0a1b2c3d-0000-4000-8000-000000000002';
      await h.messages.create({
        conversation_id: CONV,
        role: 'user',
        agent_slug: 'sinofinance',
        content: 'lanjut',
        run_id: second,
        client_message_id: null,
      });
      await collect(await h.stream.execute(second, {}, context()));

      const request = h.gateway.streamRequests[1]!.request;
      expect(request.session_id).toBe(UPSTREAM_SESSION);
      // No client_message_id stored: the contract needs a UUID, so the message id stands in.
      expect(request.client_message_id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('errors become events, never silence', () => {
    it('relays an upstream error event and stores the message with status error and the typed code (sse_transcript_error.txt)', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_error.txt'));

      const out = await collect(await h.stream.execute(HANDLE, {}, context()));

      expect(framesOf(out)).toEqual(fixtureFrames('sse_transcript_error.txt'));
      const stored = h.messages.assistantMessages();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: 'error', finish_reason: 'model_unavailable', content: '' });
      expect(h.chatRuns.get(HANDLE)).toMatchObject({ status: 'error', error_code: 'model_unavailable' });
    });

    it('emits a typed upstream_unavailable error event (503) when sineva-ai cannot be reached, stores nothing and keeps the run retryable', async () => {
      const h = await harness();
      h.gateway.failure = new UpstreamUnavailableError();

      const out = framesOf(await collect(await h.stream.execute(HANDLE, {}, context())));

      expect(out).toHaveLength(1);
      expect(out[0]!.event).toBe('error');
      expect(JSON.parse(out[0]!.data)).toMatchObject({
        code: 'upstream_unavailable',
        status: 503,
        retryable: true,
      });
      expect(h.messages.assistantMessages()).toHaveLength(0);
      expect(h.chatRuns.get(HANDLE)).toMatchObject({ status: 'pending', error_code: 'upstream_unavailable' });

      // Retry on the same handle starts a run once the engine is back.
      h.gateway.failure = null;
      const retry = framesOf(await collect(await h.stream.execute(HANDLE, {}, context())));
      expect(retry.at(-1)!.event).toBe('done');
      expect(h.chatRuns.get(HANDLE).status).toBe('completed');
    });

    it('with the real gateway adapter and an unreachable sineva-ai, the first and only event is the typed 503 error', async () => {
      vi.stubEnv('AI_ENGINE_INTERNAL_URL', 'http://sineva-ai.test:8000');
      vi.stubEnv('AI_ENGINE_INTERNAL_API_KEY', 'test_internal_key');
      const fetchMock = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });
      vi.stubGlobal('fetch', fetchMock);

      const h = await harness();
      const real = new InternalAiEngineGateway();
      const useCase = new StreamRunUseCase({
        conversations: h.conversations,
        messages: h.messages,
        chatRuns: h.chatRuns,
        gateway: real,
        contextSigner: h.signer,
        hub: h.hub,
        guard: passThroughFrameGuard,
        metrics: { record: () => undefined },
        sleep: async () => undefined,
      });

      const out = framesOf(await collect(await useCase.execute(HANDLE, {}, context())));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
        'http://sineva-ai.test:8000/api/v2/agents/sinofinance/chat/stream',
      );
      expect(out).toHaveLength(1);
      expect(JSON.parse(out[0]!.data)).toMatchObject({ code: 'upstream_unavailable', status: 503 });
    });

    it('turns a stream that ends without done into an upstream_interrupted error and keeps the partial text', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () =>
        bodyOf('id: 1\nevent: token\ndata: {"token":"Halo"}\n\n');

      const out = framesOf(await collect(await h.stream.execute(HANDLE, {}, context())));

      expect(out.map((f) => f.event)).toEqual(['token', 'error']);
      expect(JSON.parse(out[1]!.data)).toMatchObject({ code: 'upstream_interrupted', status: 502 });
      expect(h.messages.assistantMessages()[0]).toMatchObject({
        status: 'error',
        content: 'Halo',
        finish_reason: 'upstream_interrupted',
      });
    });

    it('turns a broken connection mid-stream into the same upstream_interrupted error', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const body = await h.stream.execute(HANDLE, {}, context());
      up.push('id: 1\nevent: token\ndata: {"token":"Ha"}\n\n');
      up.fail(new Error('socket hang up'));

      const out = framesOf(await collect(body));
      expect(out.at(-1)!.event).toBe('error');
      expect(JSON.parse(out.at(-1)!.data).code).toBe('upstream_interrupted');
      expect(h.chatRuns.get(HANDLE).status).toBe('error');
    });

    it('rejects a token frame that does not match the contract instead of forwarding it', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf('id: 1\nevent: token\ndata: not-json\n\n');

      const out = framesOf(await collect(await h.stream.execute(HANDLE, {}, context())));

      expect(out).toHaveLength(1);
      expect(JSON.parse(out[0]!.data)).toMatchObject({ code: 'upstream_bad_response', status: 502 });
      expect(h.chatRuns.get(HANDLE).status).toBe('error');
    });
  });

  describe('ownership before any upstream call', () => {
    it('gives 404 for a run handle that belongs to another user, without calling sineva-ai', async () => {
      const h = await harness();
      await expect(
        h.stream.execute(HANDLE, {}, context({ user_id: 'user-bravo' })),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(h.gateway.streamRequests).toHaveLength(0);
      expect(h.signer.mint).not.toHaveBeenCalled();
    });

    it('gives 404 for another workspace, an unknown handle and a handle without the run_ prefix', async () => {
      const h = await harness();
      await expect(
        h.stream.execute(HANDLE, {}, context({ workspace_id: OTHER_WS })),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        h.stream.execute('run_unknown', {}, context()),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        h.stream.execute(h.userMessage.id, {}, context()),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(h.gateway.streamRequests).toHaveLength(0);
    });
  });

  describe('streaming behaviour', () => {
    it('does not buffer: the first chunk reaches the browser before upstream finishes', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const reader = (await h.stream.execute(HANDLE, {}, context())).getReader();

      up.push('id: 1\nevent: token\ndata: {"token":"Hi"}\n\n');
      const first = await reader.read();

      expect(first.done).toBe(false);
      expect(decoder.decode(first.value)).toContain('"token":"Hi"');
      expect(h.messages.assistantMessages()).toHaveLength(0);
      up.close();
      await reader.cancel();
      await h.hub.settled(HANDLE);
    });

    it('passes the heartbeat comment through', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () =>
        bodyOf(`: heartbeat\n\n${fixture('sse_transcript_text_only.txt')}`);
      const items = await collect(await h.stream.execute(HANDLE, {}, context()));
      expect(items[0]).toEqual({ kind: 'comment', text: 'heartbeat' });
    });

    it('keeps draining and persists the message when the browser disconnects, and never cancels the run', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const reader = (await h.stream.execute(HANDLE, {}, context())).getReader();

      up.push('id: 1\nevent: token\ndata: {"token":"Halo"}\n\n');
      await reader.read();
      await reader.cancel(); // tab closed

      up.push(fixture('sse_transcript_text_only.txt').split('\n\n').slice(1).join('\n\n'));
      up.close();
      await h.hub.settled(HANDLE);

      expect(h.messages.assistantMessages()).toHaveLength(1);
      expect(h.chatRuns.get(HANDLE).status).toBe('completed');
      expect(h.gateway.cancelRequests).toHaveLength(0);
    });

    it('does not cancel a run that is waiting for approval when the tab closes, and stores needs_approval', async () => {
      const h = await harness();
      const done = JSON.parse(
        readFileSync(resolve(FIXTURES, 'chat_turn_result_v2_needs_approval.json'), 'utf8'),
      );
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const reader = (await h.stream.execute(HANDLE, {}, context())).getReader();
      await reader.cancel();

      up.push(`id: 1\nevent: done\ndata: ${JSON.stringify(done)}\n\n`);
      up.close();
      await h.hub.settled(HANDLE);

      expect(h.gateway.cancelRequests).toHaveLength(0);
      expect(h.messages.assistantMessages()[0]).toMatchObject({ status: 'needs_approval' });
      expect(h.chatRuns.get(HANDLE).status).toBe('needs_approval');
    });

    it('starts the upstream stream once even when a second tab attaches while it runs', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const first = await h.stream.execute(HANDLE, {}, context());
      const second = await h.stream.execute(HANDLE, {}, context());

      up.push(fixture('sse_transcript_text_only.txt'));
      up.close();

      expect(framesOf(await collect(first))).toEqual(fixtureFrames('sse_transcript_text_only.txt'));
      expect(framesOf(await collect(second))).toEqual(fixtureFrames('sse_transcript_text_only.txt'));
      expect(h.gateway.streamRequests).toHaveLength(1);
      expect(h.messages.assistantMessages()).toHaveLength(1);
    });
  });

  describe('resume (Last-Event-ID)', () => {
    it('serves only the events after seq N from memory while this process still holds the run', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_text_only.txt'));
      await collect(await h.stream.execute(HANDLE, {}, context()));

      const resumed = framesOf(await collect(await h.stream.execute(HANDLE, { last_event_id: '2' }, context())));

      expect(resumed.map((f) => f.id)).toEqual(['3', '4']);
      expect(h.gateway.streamRequests).toHaveLength(1);
      expect(h.gateway.replayRequests).toHaveLength(0);
    });

    it('after a restart reads sineva-ai GET runs/{id}/events?after=N and does not store the reply twice', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_text_only.txt'));
      await collect(await h.stream.execute(HANDLE, {}, context()));
      h.gateway.runEvents = parseSseTranscript(fixture('sse_transcript_text_only.txt'));

      // New process: the hub is empty, the database row is not.
      const restarted = new StreamRunUseCase({
        conversations: h.conversations,
        messages: h.messages,
        chatRuns: h.chatRuns,
        gateway: h.gateway,
        contextSigner: h.signer,
        hub: new RunHub(),
        guard: passThroughFrameGuard,
        metrics: { record: () => undefined },
        sleep: async () => undefined,
        poll_interval_ms: 1,
        replay_deadline_ms: 50,
      });
      const resumed = framesOf(await collect(await restarted.execute(HANDLE, { last_event_id: '2' }, context())));

      expect(resumed.map((f) => f.id)).toEqual(['3', '4']);
      expect(h.gateway.replayRequests[0]).toEqual({ runId: UPSTREAM_RUN, afterSeq: 2 });
      expect(h.gateway.streamRequests).toHaveLength(1);
      expect(h.messages.assistantMessages()).toHaveLength(1);
    });

    it('emits a typed error event if the replay endpoint is unreachable', async () => {
      const h = await harness();
      await collect(await h.stream.execute(HANDLE, {}, context()));
      h.gateway.failure = new UpstreamUnavailableError();
      const restarted = new StreamRunUseCase({
        conversations: h.conversations,
        messages: h.messages,
        chatRuns: h.chatRuns,
        gateway: h.gateway,
        contextSigner: h.signer,
        hub: new RunHub(),
        guard: passThroughFrameGuard,
        metrics: { record: () => undefined },
        sleep: async () => undefined,
      });
      const out = framesOf(await collect(await restarted.execute(HANDLE, { last_event_id: '2' }, context())));
      expect(out).toHaveLength(1);
      expect(JSON.parse(out[0]!.data)).toMatchObject({ code: 'upstream_unavailable', status: 503 });
    });
  });

  describe('card hook (FR-AX-09, validator arrives with WP-M0-32)', () => {
    it('forwards the card transcript unchanged through the pass-through guard', async () => {
      const h = await harness();
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_with_card.txt'));
      const out = framesOf(await collect(await h.stream.execute(HANDLE, {}, context())));
      expect(out).toEqual(fixtureFrames('sse_transcript_with_card.txt'));
    });

    it('lets the guard drop a frame before it is stored or forwarded', async () => {
      const dropCards: RunFrameGuard = {
        transform: (frame) => (frame.event.startsWith('card_') ? null : frame),
      };
      const h = await harness({ guard: dropCards });
      h.gateway.streamFactory = async () => bodyOf(fixture('sse_transcript_with_card.txt'));

      const out = framesOf(await collect(await h.stream.execute(HANDLE, {}, context())));
      expect(out.map((f) => f.event)).toEqual(['token', 'done']);
      expect(h.messages.assistantMessages()).toHaveLength(1);
    });
  });

  describe('latency metrics (FR-AIR-31)', () => {
    it('records first token and total time by specialist and language, without any text', async () => {
      let t = 1_000;
      const h = await harness({ now: () => t });
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const body = await h.stream.execute(HANDLE, {}, context());
      const reading = collect(body);

      t = 1_400;
      up.push('id: 1\nevent: token\ndata: {"token":"Halo"}\n\n');
      await vi.waitFor(() => expect(h.hub.get(HANDLE)!.frames).toHaveLength(1));
      t = 2_500;
      up.push(
        fixture('sse_transcript_text_only.txt')
          .split('\n\n')
          .slice(3)
          .join('\n\n'),
      );
      up.close();
      await reading;
      await h.hub.settled(HANDLE);

      expect(h.samples).toEqual([
        {
          agent_slug: 'sino',
          reply_language: 'id',
          outcome: 'completed',
          first_token_ms: 400,
          total_ms: 1_500,
        },
      ]);
      expect(JSON.stringify(h.samples)).not.toContain('Halo');
    });
  });

  describe('cancel (FR-HUB-21)', () => {
    it('calls sineva-ai cancel with the upstream run id and keeps the partial text as a cancelled message', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const body = await h.stream.execute(HANDLE, {}, context());
      const reading = collect(body);

      up.push(`id: 1\nevent: run_started\ndata: {"run_id":"${UPSTREAM_RUN}"}\n\n`);
      up.push('id: 2\nevent: token\ndata: {"token":"Halo, ini "}\n\n');
      await vi.waitFor(() => expect(h.hub.get(HANDLE)!.frames).toHaveLength(2));

      const result = await h.cancel.execute(HANDLE, context());
      expect(result).toEqual({ run_id: HANDLE, status: 'cancelling' });
      expect(h.gateway.cancelRequests).toEqual([
        { runId: UPSTREAM_RUN, contextToken: 'signed.context.token' },
      ]);

      // sineva-ai ends the stream with done(finish_reason=cancelled), partial text kept.
      const done = {
        ...JSON.parse(fixtureFrames('sse_transcript_text_only.txt').at(-1)!.data),
        reply_content: 'Halo, ini ',
        finish_reason: 'cancelled',
      };
      up.push(`id: 3\nevent: done\ndata: ${JSON.stringify(done)}\n\n`);
      up.close();
      await reading;
      await h.hub.settled(HANDLE);

      expect(h.messages.assistantMessages()[0]).toMatchObject({
        status: 'cancelled',
        content: 'Halo, ini ',
        finish_reason: 'cancelled',
      });
      expect(h.chatRuns.get(HANDLE).status).toBe('cancelled');
      expect(h.audit.getEvents().map((e) => e.action)).toEqual(['chat.run.cancel_requested']);
    });

    it('remembers a Stop pressed before sineva-ai reported its run id and fires it on run_started', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const reading = collect(await h.stream.execute(HANDLE, {}, context()));

      const result = await h.cancel.execute(HANDLE, context());
      expect(result.status).toBe('cancelling');
      expect(h.gateway.cancelRequests).toHaveLength(0);

      up.push(`id: 1\nevent: run_started\ndata: {"run_id":"${UPSTREAM_RUN}"}\n\n`);
      await vi.waitFor(() => expect(h.gateway.cancelRequests).toHaveLength(1));
      expect(h.gateway.cancelRequests[0]!.runId).toBe(UPSTREAM_RUN);

      up.push('id: 2\nevent: token\ndata: {"token":"x"}\n\n');
      up.close(); // stream ends without done after an accepted cancel
      await reading;
      await h.hub.settled(HANDLE);

      expect(h.messages.assistantMessages()[0]).toMatchObject({ status: 'cancelled', content: 'x' });
    });

    it('gives 404 for a foreign run handle and does not call sineva-ai', async () => {
      const h = await harness();
      await expect(h.cancel.execute(HANDLE, context({ user_id: 'user-bravo' }))).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(h.gateway.cancelRequests).toHaveLength(0);
    });

    it('answers a finished run with its status and does not call sineva-ai', async () => {
      const h = await harness();
      await collect(await h.stream.execute(HANDLE, {}, context()));
      const result = await h.cancel.execute(HANDLE, context());
      expect(result).toEqual({ run_id: HANDLE, status: 'completed' });
      expect(h.gateway.cancelRequests).toHaveLength(0);
    });

    it('surfaces a typed 503 when sineva-ai cannot be reached for the cancel, and the run keeps going', async () => {
      const h = await harness();
      const up = controlled();
      h.gateway.streamFactory = async () => up.stream;
      const reading = collect(await h.stream.execute(HANDLE, {}, context()));
      up.push(`id: 1\nevent: run_started\ndata: {"run_id":"${UPSTREAM_RUN}"}\n\n`);
      await vi.waitFor(() => expect(h.hub.get(HANDLE)!.upstreamRunId).toBe(UPSTREAM_RUN));

      h.gateway.cancelFailure = new UpstreamUnavailableError();
      await expect(h.cancel.execute(HANDLE, context())).rejects.toBeInstanceOf(DomainError);
      expect(h.hub.get(HANDLE)!.cancelAcknowledged).toBe(false);

      up.push(fixture('sse_transcript_text_only.txt').split('\n\n').slice(3).join('\n\n'));
      up.close();
      await reading;
      await h.hub.settled(HANDLE);
      expect(h.chatRuns.get(HANDLE).status).toBe('completed');
    });
  });
});
