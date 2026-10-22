import type { SseFrame } from '@/shared/sse';

/**
 * Hook that every upstream frame passes before it is stored or forwarded.
 * Return the frame (possibly rewritten) to forward it, or `null` to drop it.
 *
 * The card validator of the card registry plugs in here (FR-AX-09: validate
 * before persist and forward, a rejected card becomes its fallback text).
 * M0 emits no card events, so the wired guard forwards everything.
 */
export interface RunFrameGuard {
  transform(frame: SseFrame): SseFrame | null;
}

export const passThroughFrameGuard: RunFrameGuard = {
  transform: (frame) => frame,
};
