import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openRunStream, type RunStreamEvent } from '@/client/lib/event_stream';
import { streamErrorMessageKey, streamErrorText } from '@/client/lib/stream_errors';
import { CATALOGS } from '@/i18n/catalogs';
import { createTranslator } from '@sineva/i18n';

const FIXTURES = resolve(import.meta.dirname, 'contract/fixtures');
const fixture = (name: string) => readFileSync(resolve(FIXTURES, name), 'utf8');

const encoder = new TextEncoder();

function sseResponse(text: string, status = 200): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode(text));
        c.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function brokenResponse(text: string): Response {
  // Deliver the bytes first, break on the next read (error() would drop queued chunks).
  let sent = false;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (!sent) {
          sent = true;
          c.enqueue(encoder.encode(text));
        } else {
          c.error(new TypeError('network error'));
        }
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ success: false, status, code, message: 'nope', data: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function run(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof openRunStream>[0]> = {}) {
  const events: RunStreamEvent[] = [];
  const handle = openRunStream({
    workspaceId: 'ws-1',
    runId: 'run_abc',
    onEvent: (e) => events.push(e),
    fetchImpl,
    sleep: async () => undefined,
    backoffMs: () => 0,
    ...extra,
  });
  return { events, handle };
}

describe('openRunStream client helper (WP-M0-30, FR-AIR-11, FR-UX-31)', () => {
  it('uses fetch streaming (not EventSource) against the run events route and emits typed events in order', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(fixture('sse_transcript_text_only.txt')));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/workspaces/ws-1/runs/run_abc/events');
    expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream');
    expect(init.credentials).toBe('same-origin');
    expect(events.map((e) => e.type)).toEqual(['token', 'token', 'token', 'done']);
    expect(events[0]).toMatchObject({ type: 'token', token: 'Halo', id: '1' });
    expect(events[3]).toMatchObject({
      type: 'done',
      result: { reply_content: 'Halo! Ada yang bisa dibantu?', status: 'completed' },
    });
  });

  it('reconnects with Last-Event-ID after a dropped connection and never repeats an event', async () => {
    const text = fixture('sse_transcript_text_only.txt').split('\n\n');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(brokenResponse(`${text[0]}\n\n${text[1]}\n\n`))
      .mockResolvedValueOnce(sseResponse(`${text[2]}\n\n${text[3]}\n\n`));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;

    const second = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(second[1].headers).get('Last-Event-ID')).toBe('2');
    expect(events.map((e) => e.type)).toEqual(['token', 'token', 'token', 'done']);
  });

  it('stops without reconnecting after done', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(fixture('sse_transcript_text_only.txt')));
    const { handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('emits the error event once and does not reconnect (sse_transcript_error.txt)', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(fixture('sse_transcript_error.txt')));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      expect.objectContaining({ type: 'error', code: 'model_unavailable', retryable: false }),
    ]);
  });

  it('carries the relay-typed upstream_unavailable error (503, retryable)', async () => {
    const frame = `event: error\ndata: ${JSON.stringify({
      code: 'upstream_unavailable',
      status: 503,
      retryable: true,
      message: 'x',
    })}\n\n`;
    const fetchImpl = vi.fn(async () => sseResponse(frame));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(events).toEqual([
      expect.objectContaining({ type: 'error', code: 'upstream_unavailable', status: 503, retryable: true }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reconnects on run_busy instead of failing', async () => {
    const busy = `event: error\ndata: ${JSON.stringify({ code: 'run_busy', status: 409, retryable: true, message: 'x' })}\n\n`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(busy))
      .mockResolvedValueOnce(sseResponse(fixture('sse_transcript_text_only.txt')));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(events.map((e) => e.type)).toEqual(['token', 'token', 'token', 'done']);
  });

  it('maps an HTTP 404 to a not_found error without reconnecting', async () => {
    const fetchImpl = vi.fn(async () => jsonError(404, 'not_found'));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'not_found', status: 404 })]);
  });

  it('maps an HTTP 503 before the stream opened to a retryable upstream_unavailable error', async () => {
    const fetchImpl = vi.fn(async () => jsonError(503, 'dependency_unavailable'));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(events).toEqual([
      expect.objectContaining({ type: 'error', code: 'upstream_unavailable', retryable: true }),
    ]);
  });

  it('gives up with connection_lost after the reconnect budget is spent', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { events, handle } = run(fetchImpl as unknown as typeof fetch, { maxReconnects: 2 });
    await handle.finished;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      expect.objectContaining({ type: 'error', code: 'connection_lost', retryable: true }),
    ]);
  });

  it('aborts the request on close and emits nothing afterwards', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode('id: 1\nevent: token\ndata: {"token":"a"}\n\n'));
          },
        }),
        { status: 200 },
      );
    });
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    handle.close();
    await handle.finished;
    expect(signal?.aborted).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('turns heartbeat comments into heartbeat events', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse(`: heartbeat\n\n${fixture('sse_transcript_text_only.txt')}`),
    );
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(events[0]).toEqual({ type: 'heartbeat' });
  });

  it('forwards events it does not know as other, so new event types never break the stream', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(fixture('sse_transcript_with_card.txt')));
    const { events, handle } = run(fetchImpl as unknown as typeof fetch);
    await handle.finished;
    expect(events.map((e) => e.type)).toEqual(['token', 'other', 'other', 'other', 'done']);
  });
});

describe('stream error copy (FR-UX-31: copy maps from the code, never from the server message)', () => {
  it('maps codes to stable message keys and falls back to a generic key', () => {
    expect(streamErrorMessageKey('upstream_unavailable')).toBe('chat.error.unavailable');
    expect(streamErrorMessageKey('model_unavailable')).toBe('chat.error.unavailable');
    expect(streamErrorMessageKey('connection_lost')).toBe('chat.error.connection_lost');
    expect(streamErrorMessageKey('something_new')).toBe('chat.error.generic');
  });

  it('has a message in both languages for every code, with the companion name filled in', () => {
    for (const [locale, intl] of [
      ['en', 'en-US'],
      ['id', 'id-ID'],
    ] as const) {
      const t = createTranslator(CATALOGS[locale], '', intl, (path) => {
        throw new Error(`missing ${path}`);
      });
      for (const code of [
        'upstream_unavailable',
        'model_unavailable',
        'upstream_interrupted',
        'connection_lost',
        'unauthenticated',
        'forbidden',
        'not_found',
        'rate_limited',
        'something_new',
      ]) {
        const text = streamErrorText(t, code, 'SinoHelp');
        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toContain('{');
      }
      expect(streamErrorText(t, 'upstream_unavailable', 'SinoHelp')).toContain('SinoHelp');
    }
  });
});
