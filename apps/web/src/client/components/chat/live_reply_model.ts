// Pure model of the reply that is streaming into a chat: what the bubble
// shows, which mood the room takes, and when opening a chat should attach to
// a run that is still waiting for its reply. No React, so it is unit tested.

import type { RoomMood } from '@/client/components/room/room_model';
import type { MessageCardView, MessageView } from '@/shared/chat_view';

export type LiveReply =
  | { phase: 'idle' }
  | { phase: 'streaming'; run_id: string; text: string; stopping: boolean }
  | { phase: 'done'; run_id: string }
  | { phase: 'stopped'; run_id: string }
  | {
      phase: 'error';
      run_id: string;
      code: string;
      /** What streamed before the failure; kept so the person does not lose it. */
      text: string;
      /** `same_run`: nothing was produced, attach again. `resend`: the run is over, send the text again. */
      retry: 'same_run' | 'resend';
    };

export type LiveAction =
  | { type: 'start'; run_id: string }
  | { type: 'token'; token: string }
  | { type: 'stopping' }
  | { type: 'stop_failed' }
  | { type: 'done'; cancelled: boolean }
  | { type: 'error'; code: string; retryable: boolean }
  | { type: 'reset' };

export function reduceLiveReply(state: LiveReply, action: LiveAction): LiveReply {
  switch (action.type) {
    case 'start':
      return { phase: 'streaming', run_id: action.run_id, text: '', stopping: false };
    case 'token':
      return state.phase === 'streaming' ? { ...state, text: state.text + action.token } : state;
    case 'stopping':
      return state.phase === 'streaming' ? { ...state, stopping: true } : state;
    case 'stop_failed':
      return state.phase === 'streaming' ? { ...state, stopping: false } : state;
    case 'done':
      if (state.phase !== 'streaming') return state;
      return action.cancelled
        ? { phase: 'stopped', run_id: state.run_id }
        : { phase: 'done', run_id: state.run_id };
    case 'error':
      if (state.phase !== 'streaming') return state;
      // The relay ends a run that sineva-ai stopped without a `done` with this
      // code. It is the outcome of pressing Stop, not a failure.
      if (action.code === 'run_cancelled') return { phase: 'stopped', run_id: state.run_id };
      return {
        phase: 'error',
        run_id: state.run_id,
        code: action.code,
        text: state.text,
        retry: action.retryable ? 'same_run' : 'resend',
      };
    case 'reset':
      return { phase: 'idle' };
  }
}

export function moodForLive(state: LiveReply, sendFailed: boolean): RoomMood {
  if (sendFailed || state.phase === 'error') return 'error';
  if (state.phase === 'streaming') return 'working';
  if (state.phase === 'done') return 'done';
  return 'idle';
}

/** A message left unanswered for longer than this is not started again by opening the chat. */
const FRESH_RUN_WINDOW_MS = 15 * 60_000;

/**
 * The run to attach to when a chat opens: the last message is the person's,
 * carries a run handle, has no reply stored for that run, and is recent.
 * That covers arriving from "new chat" (the first message was just sent) and
 * a reload in the middle of a reply. The age limit stops an old unanswered
 * message from silently starting a model run weeks later.
 */
export function pendingRunToAttach(messages: MessageView[], nowMs: number): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== 'user' || !last.run_id) return null;
  const answered = messages.some((m) => m.role === 'assistant' && m.run_id === last.run_id);
  if (answered) return null;
  const age = nowMs - Date.parse(last.created_at);
  return age <= FRESH_RUN_WINDOW_MS ? last.run_id : null;
}

const CARD_STATES: ReadonlyArray<MessageCardView['state']> = [
  'drafting',
  'ready',
  'needs_review',
  'done',
  'failed',
  'disconnected',
  'cancelled',
  'expired',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A card that finished during a live reply, from the `card_completed` frame
 * the relay forwarded. The relay already validated it (ADR-0025), so this only
 * reads the shape; anything unreadable is ignored, never thrown, because a
 * card must not break the reply it belongs to. The ids are local: the stored
 * row replaces them on the next load.
 */
export function liveCardFromFrame(
  data: unknown,
  runId: string,
  position: number,
): MessageCardView | null {
  if (!isRecord(data)) return null;
  const state = CARD_STATES.find((s) => s === data.state) ?? 'ready';
  const base = {
    id: `live-${runId}-${position}`,
    message_id: `live-${runId}`,
    position,
    provider_slug: null,
    approval_id: null,
    version: 1,
  };

  if (typeof data.rejected_code === 'string') {
    return {
      ...base,
      card_type: 'unknown',
      schema_version: 0,
      state: 'failed',
      validation_status: 'rejected',
      rejected_code: data.rejected_code,
      data: {},
      actions: [],
      fallback_text: typeof data.fallback_text === 'string' ? data.fallback_text : null,
    };
  }

  const display = data.display;
  if (
    !isRecord(display) ||
    typeof display.card_type !== 'string' ||
    typeof display.schema_version !== 'number' ||
    !isRecord(display.data)
  ) {
    return null;
  }
  return {
    ...base,
    card_type: display.card_type,
    schema_version: display.schema_version,
    state,
    validation_status: 'valid',
    rejected_code: null,
    data: display.data,
    actions: Array.isArray(display.actions) ? display.actions : [],
    fallback_text: typeof display.fallback_text === 'string' ? display.fallback_text : null,
  };
}
