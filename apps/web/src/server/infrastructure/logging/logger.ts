import 'server-only';
import { mask } from '@sineva/shared';

// The only place in `src/server` allowed to touch `console` (enforced by the
// lint rule in eslint.config.mjs). Logs carry a fixed event name plus a short
// allowlist of metadata. They never carry content: request or response bodies,
// prompts, replies, tool payloads, or the id of a person (FR-SEC-19, FR-SEC-20).
//
// Why an allowlist and not "log anything, then mask": the masker only knows
// Indonesian identifiers and common secret shapes. A reply or prompt holds
// personal data that has no pattern (names, addresses, business details), so
// masking alone cannot make content safe to log. The allowlist keeps content
// out; `mask` is the second layer for the free-text fields that remain.

export type LogLevel = 'error' | 'warn' | 'info';

/** Fixed categories. Add a member here before logging a new kind of event. */
export const LOG_EVENTS = [
  'ai_engine.request_failed',
  'ai_engine.non_2xx',
  'ai_engine.non_json',
  'ai_engine.contract_violation',
  'email.send_failed',
  'breach_check.failed',
  'storage.presign_failed',
  'http.unhandled_error',
  'run.relay_failed',
  'run.metrics',
  'card.rejected',
  'entitlement.checked',
  'entitlement.would_block',
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

/**
 * Metadata a log line may carry. Adding a key is a review decision: it must be
 * a status, a code, a size, a timing, a flag or an opaque identifier of a
 * resource, never content and never the id of a person.
 */
export interface LogFields {
  status?: number;
  code?: string;
  byte_length?: number;
  latency_ms?: number;
  request_id?: string;
  aborted?: boolean;
  /** Short machine reason (an error class name). Not a message or a body. */
  reason?: string;
  agent_slug?: string;
  /** Dotted schema paths of a validation failure. Never the failing values. */
  issue_paths?: string[];
  /** Opaque id of a chat run (run_<uuid>). Identifies a resource, not a person. */
  run_handle?: string;
  first_token_ms?: number;
  total_ms?: number;
  /** Reply language code such as `id` or `en`. */
  locale?: string;
  /** Opaque id of a workspace (a tenant, not a person). */
  workspace_id?: string;
  /** Entitlement key such as `members.max`, and the access mode of the check. */
  entitlement_key?: string;
  mode?: string;
  allowed?: boolean;
  quantity?: number;
  plan_required?: string;
}

type FieldKind = 'number' | 'string' | 'boolean' | 'string_list';

// Runtime mirror of LogFields. The compiler rejects other keys, but `as`
// casts, `any` and plain JS callers bypass it, so the writer enforces the
// allowlist again.
const FIELD_KINDS: Record<keyof LogFields, FieldKind> = {
  status: 'number',
  code: 'string',
  byte_length: 'number',
  latency_ms: 'number',
  request_id: 'string',
  aborted: 'boolean',
  reason: 'string',
  agent_slug: 'string',
  issue_paths: 'string_list',
  run_handle: 'string',
  first_token_ms: 'number',
  total_ms: 'number',
  locale: 'string',
  workspace_id: 'string',
  entitlement_key: 'string',
  mode: 'string',
  allowed: 'boolean',
  quantity: 'number',
  plan_required: 'string',
};

// Bounds what an allowed string field can smuggle: a pasted body would be cut
// to this length before masking can miss part of it.
const MAX_STRING_CHARS = 200;
const MAX_LIST_ITEMS = 20;

export type LogSink = (level: LogLevel, line: string) => void;

export interface Logger {
  error(event: LogEvent, fields?: LogFields): void;
  warn(event: LogEvent, fields?: LogFields): void;
  info(event: LogEvent, fields?: LogFields): void;
}

export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function sanitizeString(value: string): string {
  // Truncate first: masking a truncated tail can only over-mask, never leak.
  return mask(value.slice(0, MAX_STRING_CHARS));
}

function sanitizeValue(kind: FieldKind, value: unknown): unknown {
  switch (kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'string':
      return typeof value === 'string' ? sanitizeString(value) : undefined;
    case 'string_list':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? (value as string[]).slice(0, MAX_LIST_ITEMS).map(sanitizeString)
        : undefined;
  }
}

function buildEntry(
  level: LogLevel,
  event: LogEvent,
  fields: LogFields | undefined,
): Record<string, unknown> {
  const entry: Record<string, unknown> = { level, event };
  let dropped = 0;
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value === undefined) {
      continue;
    }
    const kind = Object.hasOwn(FIELD_KINDS, key)
      ? FIELD_KINDS[key as keyof LogFields]
      : undefined;
    const clean = kind ? sanitizeValue(kind, value) : undefined;
    if (clean === undefined) {
      dropped += 1;
    } else {
      entry[key] = clean;
    }
  }
  if (dropped > 0) {
    // Reported, not silent: a nonzero count in production logs means a caller
    // tried to log something the policy forbids.
    entry.dropped_fields = dropped;
  }
  return entry;
}

export function createLogger(sink: LogSink): Logger {
  const write =
    (level: LogLevel) =>
    (event: LogEvent, fields?: LogFields): void => {
      sink(level, JSON.stringify(buildEntry(level, event, fields)));
    };
  return { error: write('error'), warn: write('warn'), info: write('info') };
}

// Resolved at call time, not import time, so a test spy installed after the
// module loads still receives the output.
const consoleSink: LogSink = (level, line) => {
  console[level](line);
};

export const logger: Logger = createLogger(consoleSink);
