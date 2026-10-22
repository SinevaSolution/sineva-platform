import { describe, expect, it } from 'vitest';
import {
  liveCardFromFrame,
  moodForLive,
  pendingRunToAttach,
  reduceLiveReply,
  type LiveReply,
} from '@/client/components/chat/live_reply_model';
import type { MessageView } from '@/shared/chat_view';

const idle: LiveReply = { phase: 'idle' };

function message(over: Partial<MessageView>): MessageView {
  return {
    id: 'm1',
    conversation_id: 'c1',
    role: 'user',
    agent_slug: null,
    content: 'hi',
    mentions: null,
    status: 'completed',
    finish_reason: null,
    run_id: 'run_1',
    channel: 'web',
    client_message_id: null,
    created_at: '2026-10-22T10:00:00.000Z',
    updated_at: '2026-10-22T10:00:00.000Z',
    ...over,
  };
}

describe('live reply model (WP-M0-30, FR-HUB-20, FR-HUB-21)', () => {
  it('collects streamed tokens as plain text, in order', () => {
    let s = reduceLiveReply(idle, { type: 'start', run_id: 'run_1' });
    s = reduceLiveReply(s, { type: 'token', token: 'Halo' });
    s = reduceLiveReply(s, { type: 'token', token: '! <b>Ada</b>' });
    expect(s).toEqual({ phase: 'streaming', run_id: 'run_1', text: 'Halo! <b>Ada</b>', stopping: false });
  });

  it('marks stopping, and ends as stopped when the run was cancelled', () => {
    let s = reduceLiveReply(idle, { type: 'start', run_id: 'run_1' });
    s = reduceLiveReply(s, { type: 'stopping' });
    expect(s).toMatchObject({ phase: 'streaming', stopping: true });
    expect(reduceLiveReply(s, { type: 'done', cancelled: true })).toEqual({ phase: 'stopped', run_id: 'run_1' });
  });

  it('lets Stop be pressed again when the stop request failed', () => {
    let s = reduceLiveReply(idle, { type: 'start', run_id: 'run_1' });
    s = reduceLiveReply(s, { type: 'stopping' });
    expect(reduceLiveReply(s, { type: 'stop_failed' })).toMatchObject({ phase: 'streaming', stopping: false });
  });

  it('ends as done on a normal done', () => {
    const s = reduceLiveReply(
      reduceLiveReply(idle, { type: 'start', run_id: 'run_1' }),
      { type: 'done', cancelled: false },
    );
    expect(s).toEqual({ phase: 'done', run_id: 'run_1' });
  });

  it('keeps the partial text on an error and picks the retry path from retryable', () => {
    let s = reduceLiveReply(idle, { type: 'start', run_id: 'run_1' });
    s = reduceLiveReply(s, { type: 'token', token: 'Ha' });
    expect(reduceLiveReply(s, { type: 'error', code: 'upstream_interrupted', retryable: false })).toEqual({
      phase: 'error',
      run_id: 'run_1',
      code: 'upstream_interrupted',
      text: 'Ha',
      retry: 'resend',
    });
    expect(reduceLiveReply(s, { type: 'error', code: 'upstream_unavailable', retryable: true })).toMatchObject({
      retry: 'same_run',
    });
  });

  it('treats the relay run_cancelled error as stopped, not as a failure', () => {
    const s = reduceLiveReply(
      reduceLiveReply(idle, { type: 'start', run_id: 'run_1' }),
      { type: 'error', code: 'run_cancelled', retryable: false },
    );
    expect(s).toEqual({ phase: 'stopped', run_id: 'run_1' });
  });

  it('ignores tokens and stop requests when nothing is streaming', () => {
    expect(reduceLiveReply(idle, { type: 'token', token: 'x' })).toEqual(idle);
    expect(reduceLiveReply(idle, { type: 'stopping' })).toEqual(idle);
  });

  it('restarts cleanly from an error (Retry on the same run)', () => {
    const failed: LiveReply = { phase: 'error', run_id: 'run_1', code: 'x', text: 'Ha', retry: 'same_run' };
    expect(reduceLiveReply(failed, { type: 'start', run_id: 'run_1' })).toEqual({
      phase: 'streaming',
      run_id: 'run_1',
      text: '',
      stopping: false,
    });
  });

  describe('room mood', () => {
    it('is working while streaming, done after done, error on error, idle otherwise', () => {
      expect(moodForLive({ phase: 'streaming', run_id: 'r', text: '', stopping: false }, false)).toBe('working');
      expect(moodForLive({ phase: 'done', run_id: 'r' }, false)).toBe('done');
      expect(moodForLive({ phase: 'error', run_id: 'r', code: 'x', text: '', retry: 'resend' }, false)).toBe('error');
      expect(moodForLive({ phase: 'stopped', run_id: 'r' }, false)).toBe('idle');
      expect(moodForLive(idle, false)).toBe('idle');
    });

    it('shows error when the message itself could not be sent', () => {
      expect(moodForLive(idle, true)).toBe('error');
    });
  });

  describe('pendingRunToAttach (reload mid-reply, or arrival from a new chat)', () => {
    const now = Date.parse('2026-10-22T10:01:00.000Z');

    it('returns the run of a fresh user message that has no reply yet', () => {
      expect(pendingRunToAttach([message({})], now)).toBe('run_1');
    });

    it('returns null when the run already has an assistant message (stored reply, error or stop)', () => {
      const replied = [message({}), message({ id: 'm2', role: 'assistant', status: 'error', run_id: 'run_1' })];
      expect(pendingRunToAttach(replied, now)).toBeNull();
    });

    it('returns null for an old unanswered message, so a stale run is never started by opening the chat', () => {
      const old = message({ created_at: '2026-10-21T10:00:00.000Z' });
      expect(pendingRunToAttach([old], now)).toBeNull();
    });

    it('returns null when the last message has no run handle or the thread is empty', () => {
      expect(pendingRunToAttach([message({ run_id: null })], now)).toBeNull();
      expect(pendingRunToAttach([], now)).toBeNull();
    });
  });
});

describe('liveCardFromFrame (WP-M0-32, FR-AX-13)', () => {
  const display = {
    card_type: 'guardrail_notice',
    schema_version: 1,
    data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
    actions: [],
    provider: null,
    fallback_text: 'I cannot move money.',
  };

  it('turns a validated card_completed payload into a card view with a stable live id', () => {
    expect(liveCardFromFrame({ card_id: 'crd_1', state: 'ready', display }, 'run_1', 0)).toEqual({
      id: 'live-run_1-0',
      message_id: 'live-run_1',
      position: 0,
      card_type: 'guardrail_notice',
      schema_version: 1,
      state: 'ready',
      validation_status: 'valid',
      rejected_code: null,
      provider_slug: null,
      approval_id: null,
      data: display.data,
      actions: [],
      fallback_text: 'I cannot move money.',
      version: 1,
    });
  });

  it('turns a rejected payload into a rejected view that carries only the fallback text', () => {
    expect(
      liveCardFromFrame(
        { card_id: 'crd_1', state: 'failed', rejected_code: 'unknown_card_type', fallback_text: 'Text' },
        'run_1',
        2,
      ),
    ).toMatchObject({
      id: 'live-run_1-2',
      position: 2,
      validation_status: 'rejected',
      rejected_code: 'unknown_card_type',
      state: 'failed',
      data: {},
      fallback_text: 'Text',
    });
  });

  it('ignores a payload it cannot read instead of throwing', () => {
    for (const bad of [null, 'x', 5, {}, { state: 'ready' }, { state: 'ready', display: 'no' }, { display: { card_type: 5 } }]) {
      expect(liveCardFromFrame(bad, 'run_1', 0)).toBeNull();
    }
  });

  it('falls back to ready for a state it does not know', () => {
    expect(liveCardFromFrame({ state: 'weird', display }, 'run_1', 0)).toMatchObject({ state: 'ready' });
  });
});
