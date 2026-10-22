import type { CardRejectionLog, CardValidator } from '@/server/domain/chat/card_validator';
import type { GuardedCard, RunFrameGuard, RunFrameScope } from '@/server/domain/chat/run_frame_guard';
import type { SseFrame } from '@/shared/sse';

const CARD_STATES = ['ready', 'needs_review', 'failed'] as const;
type CardState = (typeof CARD_STATES)[number];

/** FR-AX-09: at most 40 cards per message. Mirrors MAX_CARDS_PER_MESSAGE of the registry. */
const MAX_CARDS_PER_MESSAGE = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_TYPE = /^[a-z][a-z0-9_]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function claimedVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const match = /^(\d+)(?:\.\d+){0,2}$/.exec(value);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * The platform half of FR-AX-09 (ADR-0025): every card frame is validated here
 * before it is stored or forwarded, and the platform's answer is the only one
 * that counts, whatever sineva-ai validated before it emitted.
 *
 * - `card_completed` is the only frame that carries card content to the
 *   browser. It is rewritten: a valid card carries the normalised `display`;
 *   a rejected one carries only the code and the producer's fallback text, so
 *   unvalidated model output never travels on.
 * - `card_patch` is dropped. Patches would have to be checked against the
 *   `x-streamable` paths of the schema and nothing consumes them yet; a
 *   forwarded patch would be model-written data that skipped validation.
 * - `card_started` is forwarded only for a type and version the registry knows.
 *
 * A rejection never blocks the message: the frame is rewritten, not dropped,
 * so the reply and its `done` frame go through.
 */
export class CardFrameGuard implements RunFrameGuard {
  constructor(
    private readonly validator: CardValidator,
    private readonly log: CardRejectionLog,
  ) {}

  transform(frame: SseFrame, scope?: RunFrameScope): SseFrame | null {
    if (frame.event === 'card_patch') return null;
    if (frame.event === 'card_started') return this.started(frame);
    if (frame.event !== 'card_completed') return frame;
    return this.completed(frame, scope);
  }

  private started(frame: SseFrame): SseFrame | null {
    const data = parseJson(frame.data);
    if (!isRecord(data) || typeof data.card_type !== 'string') return null;
    return this.validator.supports(data.card_type, data.schema_version) ? frame : null;
  }

  private completed(frame: SseFrame, scope?: RunFrameScope): SseFrame {
    const data = parseJson(frame.data);
    const body = isRecord(data) ? data : {};
    const cardId = typeof body.card_id === 'string' && body.card_id.length <= 128 ? body.card_id : null;
    const callId = typeof body.call_id === 'string' && body.call_id.length <= 128 ? body.call_id : null;
    const approvalId =
      typeof body.approval_id === 'string' && UUID.test(body.approval_id) ? body.approval_id : null;
    const position = scope ? scope.cards.length : 0;

    const claimed = isRecord(body.display) ? body.display : {};
    const claimedType =
      typeof claimed.card_type === 'string' && CARD_TYPE.test(claimed.card_type)
        ? claimed.card_type
        : null;

    const reject = (
      code: string,
      fallbackText: string | null,
      issuePaths?: string[],
      cause?: unknown,
    ): SseFrame => {
      this.log.rejected({
        code,
        ...(cause !== undefined ? { cause } : {}),
        ...(scope ? { run_handle: scope.run_handle } : {}),
        ...(issuePaths && issuePaths.length > 0 ? { issue_paths: issuePaths } : {}),
      });
      scope?.cards.push({
        card_id: cardId,
        call_id: callId,
        position,
        state: 'failed',
        approval_id: null,
        outcome: {
          ok: false,
          code,
          fallback_text: fallbackText,
          claimed_type: claimedType,
          claimed_version: claimedVersion(claimed.schema_version),
        },
      });
      return {
        ...frame,
        data: JSON.stringify({
          card_id: cardId,
          state: 'failed',
          rejected_code: code,
          fallback_text: fallbackText,
        }),
      };
    };

    if (scope && scope.cards.length >= MAX_CARDS_PER_MESSAGE) {
      const text = typeof claimed.fallback_text === 'string' ? claimed.fallback_text : null;
      return reject('too_many_cards', text === null ? null : text.slice(0, 4_000));
    }

    let check;
    try {
      check = this.validator.validate(body.display);
    } catch (cause) {
      // A broken validator must not take the reply down with it, and must not
      // pass the card either.
      return reject('validator_error', null, undefined, cause);
    }

    if (!check.ok) return reject(check.code, check.fallback_text, check.issue_paths);

    const rawState = body.state ?? 'ready';
    const state = (CARD_STATES as readonly unknown[]).includes(rawState) ? (rawState as CardState) : null;
    if (state === null) return reject('schema_invalid', check.card.fallback_text);

    const guarded: GuardedCard = {
      card_id: cardId,
      call_id: callId,
      position,
      state,
      approval_id: approvalId,
      outcome: { ok: true, card: check.card },
    };
    scope?.cards.push(guarded);
    return {
      ...frame,
      data: JSON.stringify({
        card_id: cardId,
        state,
        ...(approvalId ? { approval_id: approvalId } : {}),
        display: {
          card_type: check.card.card_type,
          schema_version: check.card.schema_version,
          data: check.card.data,
          actions: check.card.actions,
          provider: check.card.provider,
          fallback_text: check.card.fallback_text,
        },
      }),
    };
  }
}
