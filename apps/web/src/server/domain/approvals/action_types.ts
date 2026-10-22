import { createHash } from 'node:crypto';

// Minimal action-type registry (FR-INBOX-06). The M2 Tool Gateway extends it
// with executing types without changing the item model.

export type RiskLevel = 'low' | 'medium' | 'high';

export interface SentenceSource {
  agent_slug: string;
  payload: Record<string, unknown>;
}

/** A catalog key plus structured params; the client localizes it. */
export interface Sentence {
  key: string;
  params: Record<string, unknown>;
}

export interface ActionTypeDefinition {
  action_type: string;
  risk_level: RiskLevel;
  reversible: boolean;
  autonomy_eligible: boolean;
  guardrail_locked: boolean;
  /** True only for types whose approval triggers a gateway execution. */
  executes: boolean;
  editable_fields: readonly string[];
  /** Payload field holding a time the approval must not outlive. */
  expiry_bound_field?: string;
  /** Catalog key of the note shown next to the approve button. */
  approve_note_key: string;
  /** Built from structured fields only, never from model text. */
  sentence(source: SentenceSource): Sentence;
}

export type PayloadCheck = { ok: true } | { ok: false; code: string; detail: string };

const DRAFT_KIND = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_TITLE = 200;
const MAX_BODY = 20_000;
const DRAFT_REVIEW_FIELDS = ['draft_kind', 'title', 'body'];

function validateDraftReview(payload: Record<string, unknown>): PayloadCheck {
  const bad = (detail: string): PayloadCheck => ({ ok: false, code: 'invalid_payload', detail });
  for (const key of Object.keys(payload)) {
    if (!DRAFT_REVIEW_FIELDS.includes(key)) return bad(`unknown field ${key}`);
  }
  if (typeof payload.draft_kind !== 'string' || !DRAFT_KIND.test(payload.draft_kind)) {
    return bad('draft_kind');
  }
  if (payload.title !== undefined && payload.title !== null) {
    if (typeof payload.title !== 'string' || payload.title.length > MAX_TITLE) return bad('title');
  }
  if (typeof payload.body !== 'string' || payload.body.length < 1 || payload.body.length > MAX_BODY) {
    return bad('body');
  }
  return { ok: true };
}

const DRAFT_REVIEW: ActionTypeDefinition = {
  action_type: 'draft.review',
  risk_level: 'low',
  reversible: true,
  autonomy_eligible: false,
  guardrail_locked: false,
  executes: false,
  editable_fields: ['title', 'body'],
  approve_note_key: 'inbox.approve_note.draft_review',
  sentence: ({ agent_slug, payload }) => ({
    key: 'inbox.sentence.draft_review',
    // Only the slug and the kind slug: nothing the model wrote reaches the sentence.
    params: { specialist_slug: agent_slug, draft_kind: String(payload.draft_kind ?? '') },
  }),
};

export const ACTION_TYPES: Readonly<Record<string, ActionTypeDefinition>> = {
  'draft.review': DRAFT_REVIEW,
};

export function getActionType(actionType: string): ActionTypeDefinition | null {
  return Object.prototype.hasOwnProperty.call(ACTION_TYPES, actionType) ? ACTION_TYPES[actionType] : null;
}

export function validatePayload(actionType: string, payload: Record<string, unknown>): PayloadCheck {
  if (actionType === 'draft.review') return validateDraftReview(payload);
  return { ok: false, code: 'unsupported_action_type', detail: actionType };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

/** SHA-256 of the key-sorted JSON, so the same content always hashes the same. */
export function hashPayload(payload: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')}`;
}

export type EditResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; code: 'field_not_editable' | 'invalid_payload' | 'unsupported_action_type'; detail: string };

/** Merges an edit into a payload: only editable fields, and the result must still validate. */
export function applyEditablePayload(
  actionType: string,
  current: Record<string, unknown>,
  edits: Record<string, unknown>,
): EditResult {
  const definition = getActionType(actionType);
  if (!definition) return { ok: false, code: 'unsupported_action_type', detail: actionType };
  for (const key of Object.keys(edits)) {
    if (!definition.editable_fields.includes(key)) {
      return { ok: false, code: 'field_not_editable', detail: key };
    }
  }
  const merged = { ...current, ...edits };
  const check = validatePayload(actionType, merged);
  if (!check.ok) return { ok: false, code: 'invalid_payload', detail: check.detail };
  return { ok: true, payload: merged };
}

const DAY_MS = 24 * 60 * 60_000;
export const DEFAULT_APPROVAL_TTL_MS = 7 * DAY_MS;
export const MAX_APPROVAL_TTL_MS = 30 * DAY_MS;

/**
 * Default 7 days, never later than a time named inside the payload (a post
 * scheduled for Friday 10:00 expires then). A producer may ask for less, or
 * for more up to 30 days; the cap keeps a forgotten draft from lingering.
 */
export function computeApprovalExpiry(
  definition: Pick<ActionTypeDefinition, 'expiry_bound_field'>,
  payload: Record<string, unknown>,
  now: Date,
  requested?: Date | null,
): Date {
  const defaultAt = now.getTime() + DEFAULT_APPROVAL_TTL_MS;
  const maxAt = now.getTime() + MAX_APPROVAL_TTL_MS;
  let at = requested ? Math.min(requested.getTime(), maxAt) : defaultAt;
  const field = definition.expiry_bound_field;
  const raw = field ? payload[field] : undefined;
  if (typeof raw === 'string') {
    const bound = Date.parse(raw);
    if (Number.isFinite(bound)) at = Math.min(at, bound);
  }
  return new Date(at);
}
