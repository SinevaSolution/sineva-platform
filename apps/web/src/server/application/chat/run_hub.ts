import type { SseFrame, SseItem } from '@/shared/sse';

export interface RunSubscriber {
  onItem(item: SseItem): void;
  onEnd(): void;
}

/**
 * One live run inside this process: the frames received so far (so a
 * reconnect can be served from memory) and the browsers currently attached.
 * Nothing here talks to the network or the database.
 */
export class RunSession {
  readonly frames: SseFrame[] = [];
  upstreamRunId: string | null = null;
  /** The person pressed Stop before sineva-ai had reported its run id. */
  cancelRequested = false;
  /** sineva-ai accepted a cancel for this run. */
  cancelAcknowledged = false;
  private finished = false;
  private readonly subscribers = new Set<RunSubscriber>();

  constructor(readonly handle: string) {}

  get isFinished(): boolean {
    return this.finished;
  }

  publish(item: SseItem): void {
    if (this.finished) return;
    // Comments are heartbeats: forwarded live, never replayed.
    if (item.kind === 'frame') this.frames.push(item.frame);
    for (const subscriber of [...this.subscribers]) subscriber.onItem(item);
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    for (const subscriber of [...this.subscribers]) subscriber.onEnd();
    this.subscribers.clear();
  }

  /**
   * Replays buffered frames after `lastEventId`, then follows live. Returns
   * the unsubscribe function; unsubscribing never stops the run.
   */
  subscribe(lastEventId: string | undefined, subscriber: RunSubscriber): () => void {
    for (const frame of this.framesAfter(lastEventId)) {
      subscriber.onItem({ kind: 'frame', frame });
    }
    if (this.finished) {
      subscriber.onEnd();
      return () => {};
    }
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private framesAfter(lastEventId: string | undefined): SseFrame[] {
    if (lastEventId === undefined || lastEventId === '') return this.frames;
    const numeric = Number(lastEventId);
    if (Number.isFinite(numeric)) {
      return this.frames.filter((f) => f.id !== undefined && Number(f.id) > numeric);
    }
    const index = this.frames.findIndex((f) => f.id === lastEventId);
    return index === -1 ? this.frames : this.frames.slice(index + 1);
  }
}

/**
 * Registry of live runs by handle. A finished run stays for `retention_ms` so
 * a browser that reconnects right after `done` still gets the tail from
 * memory; after that, resume goes through sineva-ai's replay endpoint.
 */
export class RunHub {
  private readonly sessions = new Map<string, RunSession>();
  private readonly drains = new Map<string, Promise<void>>();
  private readonly retentionMs: number;

  constructor(options: { retention_ms?: number } = {}) {
    this.retentionMs = options.retention_ms ?? 60_000;
  }

  get(handle: string): RunSession | undefined {
    return this.sessions.get(handle);
  }

  create(handle: string): RunSession {
    const session = new RunSession(handle);
    this.sessions.set(handle, session);
    return session;
  }

  /** Remembers the detached drain so tests and shutdown can await it. */
  track(handle: string, drain: Promise<void>): void {
    this.drains.set(handle, drain);
    void drain.finally(() => {
      if (this.drains.get(handle) === drain) this.drains.delete(handle);
    });
  }

  settled(handle: string): Promise<void> {
    return this.drains.get(handle) ?? Promise.resolve();
  }

  release(handle: string, session?: RunSession): void {
    // A newer session may already own the handle (retry after a failed
    // start); never drop that one.
    if (session && this.sessions.get(handle) !== session) return;
    this.sessions.delete(handle);
  }

  /** Drop the finished session after the retention window. */
  releaseLater(handle: string, session: RunSession): void {
    if (this.retentionMs <= 0) {
      this.release(handle, session);
      return;
    }
    const timer = setTimeout(() => this.release(handle, session), this.retentionMs);
    // Never keep the process alive just to forget a finished run.
    timer.unref?.();
  }
}
