import { describe, expect, it } from 'vitest';
import { CardFrameGuard } from '@/server/application/chat/card_frame_guard';
import type { RunFrameScope } from '@/server/domain/chat/run_frame_guard';
import { CardSchemaValidator } from '@/server/infrastructure/cards/card_schema_validator';
import type { SseFrame } from '@/shared/sse';

const APPROVAL = '7b8c9d0e-1f2a-4b4c-8d6e-7f8a9b0c1d2e';

const guardrailDisplay = (over: Record<string, unknown> = {}) => ({
  card_type: 'guardrail_notice',
  schema_version: 1,
  data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
  actions: [{ id: 'prepare', kind: 'send_to_chat', label_key: 'cards.guardrail.prepare' }],
  provider: null,
  fallback_text: 'I cannot move money. I can prepare the details for you.',
  ...over,
});

const completed = (payload: Record<string, unknown>, id = '3'): SseFrame => ({
  id,
  event: 'card_completed',
  data: JSON.stringify(payload),
});

function setup() {
  const rejections: Array<Record<string, unknown>> = [];
  const guard = new CardFrameGuard(new CardSchemaValidator(), {
    rejected: (detail) => rejections.push(detail),
  });
  const scope: RunFrameScope = { run_handle: 'run_test-1', cards: [] };
  return { guard, scope, rejections };
}

const dataOf = (frame: SseFrame | null) => JSON.parse(frame!.data) as Record<string, unknown>;

describe('CardFrameGuard (WP-M0-32, FR-AX-09)', () => {
  it('passes every non-card frame through untouched', () => {
    const { guard, scope } = setup();
    for (const frame of [
      { id: '1', event: 'token', data: '{"token":"hi"}' },
      { id: '9', event: 'done', data: '{}' },
      { event: 'error', data: '{"code":"x"}' },
    ]) {
      expect(guard.transform(frame, scope)).toBe(frame);
    }
    expect(scope.cards).toEqual([]);
  });

  it('forwards a valid card_completed with the normalised display and records it', () => {
    const { guard, scope, rejections } = setup();
    const out = guard.transform(
      completed({ card_id: 'crd_1', state: 'ready', display: guardrailDisplay(), approval_id: APPROVAL }),
      scope,
    );
    expect(out).toMatchObject({ id: '3', event: 'card_completed' });
    expect(dataOf(out)).toMatchObject({
      card_id: 'crd_1',
      state: 'ready',
      display: { card_type: 'guardrail_notice', schema_version: 1, fallback_text: expect.any(String) },
    });
    expect(rejections).toEqual([]);
    expect(scope.cards).toHaveLength(1);
    expect(scope.cards[0]).toMatchObject({
      card_id: 'crd_1',
      position: 0,
      state: 'ready',
      approval_id: APPROVAL,
      outcome: { ok: true },
    });
  });

  it('numbers cards in completion order', () => {
    const { guard, scope } = setup();
    guard.transform(completed({ card_id: 'a', state: 'ready', display: guardrailDisplay() }), scope);
    guard.transform(completed({ card_id: 'b', state: 'needs_review', display: guardrailDisplay() }), scope);
    expect(scope.cards.map((c) => [c.card_id, c.position, c.state])).toEqual([
      ['a', 0, 'ready'],
      ['b', 1, 'needs_review'],
    ]);
  });

  it('ignores an approval_id that is not a UUID', () => {
    const { guard, scope } = setup();
    guard.transform(
      completed({ card_id: 'a', state: 'ready', display: guardrailDisplay(), approval_id: 'drop table' }),
      scope,
    );
    expect(scope.cards[0]!.approval_id).toBeNull();
  });

  it('turns an unknown card_type into a failed frame with the fallback text, and logs the code only', () => {
    const { guard, scope, rejections } = setup();
    const out = guard.transform(
      completed({
        card_id: 'crd_9',
        state: 'ready',
        display: guardrailDisplay({ card_type: 'runway_metrics', data: { secret: 'do not echo' } }),
      }),
      scope,
    );
    const body = dataOf(out);
    expect(body).toEqual({
      card_id: 'crd_9',
      state: 'failed',
      rejected_code: 'unknown_card_type',
      fallback_text: 'I cannot move money. I can prepare the details for you.',
    });
    expect(out!.data).not.toContain('do not echo');
    expect(rejections).toEqual([{ code: 'unknown_card_type', run_handle: 'run_test-1' }]);
    expect(scope.cards[0]).toMatchObject({
      outcome: { ok: false, code: 'unknown_card_type', claimed_type: 'runway_metrics', claimed_version: 1 },
    });
  });

  it('rejects an unsupported version and an unknown field', () => {
    const { guard, scope } = setup();
    const version = guard.transform(
      completed({ card_id: 'a', state: 'ready', display: guardrailDisplay({ schema_version: 9 }) }),
      scope,
    );
    expect(dataOf(version)).toMatchObject({ rejected_code: 'unsupported_version' });
    const extra = guard.transform(
      completed({
        card_id: 'b',
        state: 'ready',
        display: guardrailDisplay({
          data: { specialist: 'sinofinance', limit_key: 'x', offer_key: 'y', html: '<b>x</b>' },
        }),
      }),
      scope,
    );
    expect(dataOf(extra)).toMatchObject({ rejected_code: 'schema_invalid' });
    expect(extra!.data).not.toContain('<b>');
  });

  it('rejects the contract fixture shape (final_payload, no display) as display_missing', () => {
    const { guard, scope } = setup();
    const out = guard.transform(
      completed({ card_id: 'crd_98765', final_payload: { runway_months: 18, currency: 'USD' } }),
      scope,
    );
    expect(dataOf(out)).toEqual({
      card_id: 'crd_98765',
      state: 'failed',
      rejected_code: 'display_missing',
      fallback_text: null,
    });
  });

  it('rejects data that is not JSON and a state outside the allowed set', () => {
    const { guard, scope } = setup();
    const broken = guard.transform({ id: '2', event: 'card_completed', data: '{not json' }, scope);
    expect(dataOf(broken)).toMatchObject({ state: 'failed', rejected_code: 'display_missing' });
    const state = guard.transform(
      completed({ card_id: 'a', state: 'exploded', display: guardrailDisplay() }),
      scope,
    );
    expect(dataOf(state)).toMatchObject({ rejected_code: 'schema_invalid' });
  });

  it('rejects the 41st card of a message (FR-AX-09: 40 per message)', () => {
    const { guard, scope } = setup();
    for (let i = 0; i < 40; i += 1) {
      const out = guard.transform(
        completed({ card_id: `c${i}`, state: 'ready', display: guardrailDisplay() }),
        scope,
      );
      expect(dataOf(out)).toMatchObject({ state: 'ready' });
    }
    const out = guard.transform(
      completed({ card_id: 'c40', state: 'ready', display: guardrailDisplay() }),
      scope,
    );
    expect(dataOf(out)).toMatchObject({ state: 'failed', rejected_code: 'too_many_cards' });
    expect(scope.cards).toHaveLength(41);
    expect(scope.cards[40]).toMatchObject({ outcome: { ok: false, code: 'too_many_cards' } });
  });

  it('never throws and never blocks when the validator itself fails', () => {
    const rejections: Array<Record<string, unknown>> = [];
    const guard = new CardFrameGuard(
      {
        validate: () => {
          throw new Error('boom');
        },
        supports: () => true,
      },
      { rejected: (d) => rejections.push(d) },
    );
    const scope: RunFrameScope = { run_handle: 'run_x', cards: [] };
    const out = guard.transform(completed({ card_id: 'a', state: 'ready', display: guardrailDisplay() }), scope);
    expect(dataOf(out)).toMatchObject({ state: 'failed', rejected_code: 'validator_error' });
    expect(rejections[0]).toMatchObject({ code: 'validator_error' });
  });

  it('forwards card_started only for a supported type and version, and drops the rest', () => {
    const { guard, scope } = setup();
    const ok: SseFrame = {
      id: '2',
      event: 'card_started',
      data: JSON.stringify({ card_id: 'a', card_type: 'guardrail_notice', schema_version: 1 }),
    };
    expect(guard.transform(ok, scope)).toBe(ok);
    for (const data of [
      { card_id: 'a', card_type: 'runway_metrics', schema_version: '1.0.0' },
      { card_id: 'a', card_type: 'guardrail_notice', schema_version: 7 },
      { card_id: 'a' },
    ]) {
      expect(guard.transform({ id: '2', event: 'card_started', data: JSON.stringify(data) }, scope)).toBeNull();
    }
    expect(guard.transform({ id: '2', event: 'card_started', data: 'nope' }, scope)).toBeNull();
  });

  it('drops card_patch frames: only the validated final card reaches the browser', () => {
    const { guard, scope } = setup();
    const patch: SseFrame = {
      id: '3',
      event: 'card_patch',
      data: JSON.stringify({ card_id: 'a', patch: { html: '<img src=x onerror=alert(1)>' } }),
    };
    expect(guard.transform(patch, scope)).toBeNull();
  });

  it('works without a scope (replay of a frame that nobody persists)', () => {
    const { guard } = setup();
    const out = guard.transform(completed({ card_id: 'a', state: 'ready', display: guardrailDisplay() }));
    expect(dataOf(out)).toMatchObject({ state: 'ready' });
  });
});
