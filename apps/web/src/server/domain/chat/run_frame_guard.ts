import type { SseFrame } from '@/shared/sse';
import type { ValidatedCard } from './card_validator';

/** A card the guard has dealt with, kept so the relay can persist it with the reply. */
export interface GuardedCard {
  /** The producer's card id, for correlation only. Never a database key. */
  card_id: string | null;
  call_id: string | null;
  /** Order of completion inside the message, from 0. */
  position: number;
  state: 'ready' | 'needs_review' | 'failed';
  approval_id: string | null;
  outcome:
    | { ok: true; card: ValidatedCard }
    | {
        ok: false;
        code: string;
        fallback_text: string | null;
        /** What the producer claimed, kept only to label the rejected row. */
        claimed_type: string | null;
        claimed_version: number | null;
      };
}

/**
 * Per-run state the guard may read and extend. The relay creates one per run
 * (and one per replay) and reads `cards` when it stores the reply.
 */
export interface RunFrameScope {
  run_handle: string;
  cards: GuardedCard[];
}

/**
 * Hook that every upstream frame passes before it is stored or forwarded.
 * Return the frame (possibly rewritten) to forward it, or `null` to drop it.
 *
 * The card validator plugs in here (FR-AX-09: validate before persist and
 * forward, a rejected card becomes its fallback text). `scope` carries the
 * per-run count and the validated cards; a guard without per-run state
 * ignores it.
 */
export interface RunFrameGuard {
  transform(frame: SseFrame, scope?: RunFrameScope): SseFrame | null;
}

export const passThroughFrameGuard: RunFrameGuard = {
  transform: (frame) => frame,
};
