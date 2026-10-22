// Browser side of the run relay (ADR-0022, FR-AIR-11, FR-AIR-12). It reads
// the platform's SSE stream with `fetch`, not `EventSource`: EventSource
// cannot send our own headers (Last-Event-ID on a reconnect we control) or
// map failures to typed errors. It reconnects with backoff, never repeats an
// event, and stops for good on `done` or a final `error`.

import { SseParser, type SseFrame } from '@/shared/sse';

export interface RunDoneResult {
  reply_content: string;
  status: string;
  finish_reason: string | null;
  agent_slug: string;
  routed_agent_slug: string;
  reply_language: string;
}

export type RunStreamEvent =
  | { type: 'token'; id?: string; token: string }
  | { type: 'done'; id?: string; result: RunDoneResult }
  | { type: 'error'; code: string; message: string; status?: number; retryable: boolean }
  | { type: 'heartbeat' }
  /** Any event this helper does not interpret (cards, status, usage). Forwarded, never dropped. */
  | { type: 'other'; id?: string; event: string; data: unknown };

export interface OpenRunStreamOptions {
  workspaceId: string;
  /** The run handle from POST .../messages. */
  runId: string;
  onEvent: (event: RunStreamEvent) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Consecutive failed connections before giving up. Resets whenever events arrive. */
  maxReconnects?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunStreamHandle {
  /** Stops reading. The run itself keeps going on the server; use cancel to stop it. */
  close(): void;
  /** Settles when the stream has ended for good (never rejects). */
  finished: Promise<void>;
}

/** Relay errors that mean "reattach", not "failed". */
const RECONNECT_CODES = new Set(['run_busy', 'stream_timeout']);

type Attempt = { outcome: 'terminal' | 'dropped'; progressed: boolean };

function defaultBackoff(attempt: number): number {
  // 0.5 s, 1 s, 2 s, 4 s ... capped, with jitter so tabs do not reconnect in lockstep.
  return Math.min(8_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function eventFromFrame(frame: SseFrame): RunStreamEvent {
  const data = parseJson(frame.data);
  const withId = frame.id !== undefined ? { id: frame.id } : {};

  if (frame.event === 'token' && isRecord(data) && typeof data.token === 'string') {
    return { type: 'token', ...withId, token: data.token };
  }
  if (frame.event === 'done' && isRecord(data) && typeof data.reply_content === 'string') {
    return {
      type: 'done',
      ...withId,
      result: {
        reply_content: data.reply_content,
        status: String(data.status ?? 'completed'),
        finish_reason: typeof data.finish_reason === 'string' ? data.finish_reason : null,
        agent_slug: String(data.agent_slug ?? ''),
        routed_agent_slug: String(data.routed_agent_slug ?? data.agent_slug ?? ''),
        reply_language: String(data.reply_language ?? ''),
      },
    };
  }
  if (frame.event === 'error') {
    const body = isRecord(data) ? data : {};
    return {
      type: 'error',
      code: typeof body.code === 'string' ? body.code : 'internal_error',
      message: typeof body.message === 'string' ? body.message : '',
      ...(typeof body.status === 'number' ? { status: body.status } : {}),
      retryable: body.retryable === true,
    };
  }
  return { type: 'other', ...withId, event: frame.event, data: data ?? frame.data };
}

function httpError(status: number): RunStreamEvent {
  if (status === 401) return { type: 'error', code: 'unauthenticated', message: '', status, retryable: false };
  if (status === 403) return { type: 'error', code: 'forbidden', message: '', status, retryable: false };
  if (status === 404) return { type: 'error', code: 'not_found', message: '', status, retryable: false };
  if (status === 429) return { type: 'error', code: 'rate_limited', message: '', status, retryable: true };
  if (status === 502 || status === 503) {
    return { type: 'error', code: 'upstream_unavailable', message: '', status, retryable: true };
  }
  return { type: 'error', code: 'internal_error', message: '', status, retryable: false };
}

export function openRunStream(options: OpenRunStreamOptions): RunStreamHandle {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const backoff = options.backoffMs ?? defaultBackoff;
  const maxReconnects = options.maxReconnects ?? 5;
  const url = `/api/v1/workspaces/${options.workspaceId}/runs/${options.runId}/events`;

  let lastEventId: string | undefined;

  const emit = (event: RunStreamEvent) => {
    if (!controller.signal.aborted) options.onEvent(event);
  };

  async function connectOnce(): Promise<Attempt> {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (lastEventId !== undefined) headers['Last-Event-ID'] = lastEventId;

    const response = await doFetch(url, {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      // A JSON error from before the stream opened (401, 404, 503 ...).
      emit(httpError(response.status));
      return { outcome: 'terminal', progressed: false };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let progressed = false;
    // fetch ties the body to the signal already; this also covers bodies that are not.
    controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => undefined), {
      once: true,
    });

    for (;;) {
      const { done, value } = await reader.read();
      const items = done ? parser.flush() : parser.push(decoder.decode(value, { stream: true }));
      for (const item of items) {
        if (item.kind === 'comment') {
          emit({ type: 'heartbeat' });
          continue;
        }
        const event = eventFromFrame(item.frame);
        if (event.type === 'error' && RECONNECT_CODES.has(event.code)) {
          return { outcome: 'dropped', progressed };
        }
        progressed = true;
        if (item.frame.id !== undefined) lastEventId = item.frame.id;
        emit(event);
        if (event.type === 'done' || event.type === 'error') {
          await reader.cancel();
          return { outcome: 'terminal', progressed };
        }
      }
      if (done) return { outcome: 'dropped', progressed };
    }
  }

  async function pump(): Promise<void> {
    let failures = 0;
    while (!controller.signal.aborted) {
      let attempt: Attempt;
      try {
        attempt = await connectOnce();
      } catch {
        // Network failure or a body that broke mid-stream. An abort lands
        // here too and is checked by the loop condition.
        attempt = { outcome: 'dropped', progressed: false };
      }
      if (attempt.outcome === 'terminal' || controller.signal.aborted) return;

      failures = attempt.progressed ? 1 : failures + 1;
      if (failures > maxReconnects) {
        emit({
          type: 'error',
          code: 'connection_lost',
          message: '',
          retryable: true,
        });
        return;
      }
      await sleep(backoff(failures));
    }
  }

  return { close: () => controller.abort(), finished: pump() };
}
