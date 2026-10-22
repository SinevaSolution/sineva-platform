import type { AuditEvent } from '@/server/domain/audit/audit_logger';

export type AuditActorType = 'user' | 'specialist' | 'system' | 'support' | 'mcp_client';
export type AuditOutcome = 'allowed' | 'denied' | 'error';

export const AUDIT_ACTOR_TYPES: readonly AuditActorType[] = [
  'user',
  'specialist',
  'system',
  'support',
  'mcp_client',
];
export const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['allowed', 'denied', 'error'];

export interface AuditChange {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * One row of the audit log as it is written (FR-SEC-32). `prev_hash` and
 * `hash` are deliberately absent: the per-workspace chain is computed under
 * an advisory lock when the chain lands, and v0 rows keep both columns null.
 * `workspace_id` is null for events that have no workspace, such as sign-in.
 */
export interface NewAuditEventRecord {
  workspace_id: string | null;
  occurred_at?: Date;
  actor_type: AuditActorType;
  actor_id: string;
  on_behalf_of_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  outcome: AuditOutcome;
  reason_code: string | null;
  request_id: string | null;
  run_id: string | null;
  ip: string | null;
  user_agent: string | null;
  change: AuditChange | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditEventEntity extends Omit<NewAuditEventRecord, 'occurred_at'> {
  id: string;
  occurred_at: string;
  prev_hash: string | null;
  hash: string | null;
}

const REDACTED = '[redacted]';
const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 4;
const MAX_USER_AGENT_LENGTH = 512;

// Credentials and secrets: redacted whatever the key suffix.
const SECRET_KEY = /(password|passwd|secret|token|authorization|cookie|api[_-]?key|credential|private[_-]?key|otp)/i;
// Message text and personal data (P2 in the security PRD): redacted unless the
// key says the value is a hash, an id or a count (`emailHash`, `message_count`),
// which is exactly the "reference by id, never copy" form the log wants.
const CONTENT_OR_PII_KEY =
  /(content|message|text|prompt|reply|transcript|body|about_me|full_name|preferred_name|salutation|email|phone|nik|npwp|address|avatar)/i;
const REFERENCE_KEY_SUFFIX = /(_hash|Hash|_id|Id|_ids|_count|Count)$/;

function isRedactedKey(key: string): boolean {
  if (SECRET_KEY.test(key)) {
    return !/(_hash|Hash)$/.test(key);
  }
  return CONTENT_OR_PII_KEY.test(key) && !REFERENCE_KEY_SUFFIX.test(key);
}

/**
 * Bounded, key-based redaction applied to `change` and `metadata` before they
 * reach the database. Key-based on purpose: values carry no reliable marker
 * (a name looks like any string), so the contract is that callers pass ids,
 * counts and field names, and anything under a sensitive key is replaced even
 * if a caller slips.
 */
export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => redactAuditValue(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`+${value.length - MAX_ARRAY_LENGTH} more`);
    }
    return items;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isRedactedKey(key) ? REDACTED : redactAuditValue(inner, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

function redactRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  return redactAuditValue(value) as Record<string, unknown>;
}

function expandIpv6(address: string): number[] | null {
  const halves = address.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) {
    return null;
  }
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const numbers = groups.map((group) => (/^[0-9a-fA-F]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return numbers.some(Number.isNaN) ? null : numbers;
}

/**
 * IPv4 keeps the /24 prefix, IPv6 the /48 prefix. The full address is not
 * needed to answer "where did this come from" and is personal data; the
 * retention period for even the truncated value is OQ-SEC-8.
 */
export function truncateIp(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  const candidate = mapped?.[1] ?? raw;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(candidate);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return null;
    }
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  }
  const groups = candidate.includes(':') ? expandIpv6(candidate) : null;
  if (!groups) {
    return null;
  }
  // Trailing zero groups of the prefix fold into the `::`, giving one
  // canonical spelling per network (`2001:db8::`, not `2001:db8:0::`).
  const prefix = groups.slice(0, 3);
  while (prefix.length > 0 && prefix[prefix.length - 1] === 0) {
    prefix.pop();
  }
  return `${prefix.map((group) => group.toString(16)).join(':')}::`;
}

function resolveActor(event: AuditEvent): { actor_type: AuditActorType; actor_id: string } {
  if (event.actor) {
    return { actor_type: event.actor.type, actor_id: event.actor.id };
  }
  const { context } = event;
  const contextActor = context.actor;
  // Use cases build `{ ...createAnonymousRequestContext(...), user_id }`, which
  // overrides the user but keeps the anonymous system actor. A real user id
  // wins over that placeholder so the row names who acted.
  const isAnonymousPlaceholder =
    contextActor?.type === 'system' && contextActor.id === 'anonymous';
  const hasRealUser = context.user_id !== 'anonymous' && !context.user_id.startsWith('system:');
  if (isAnonymousPlaceholder && hasRealUser) {
    return { actor_type: 'user', actor_id: context.user_id };
  }
  if (contextActor) {
    return { actor_type: contextActor.type, actor_id: contextActor.id };
  }
  return hasRealUser
    ? { actor_type: 'user', actor_id: context.user_id }
    : { actor_type: 'system', actor_id: context.user_id };
}

function change(event: AuditEvent): AuditChange | null {
  if (!event.change) {
    return null;
  }
  const before = redactRecord(event.change.before);
  const after = redactRecord(event.change.after);
  return {
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
}

/**
 * The single place an audit event becomes a row: attribution, truncation and
 * redaction all happen here so no adapter can write an unredacted event.
 */
export function buildAuditRecord(event: AuditEvent): NewAuditEventRecord {
  const { context } = event;
  const { actor_type, actor_id } = resolveActor(event);
  const userAgent = event.user_agent ?? context.user_agent;
  return {
    workspace_id: event.workspace_id ?? context.workspace_id ?? null,
    ...(event.timestamp ? { occurred_at: event.timestamp } : {}),
    actor_type,
    actor_id,
    on_behalf_of_user_id: event.on_behalf_of_user_id ?? null,
    action: event.action,
    target_type: event.target_resource_type ?? null,
    target_id: event.target_resource_id ?? null,
    outcome: event.outcome ?? 'allowed',
    reason_code: event.reason_code ?? null,
    request_id: context.request_id || null,
    run_id: event.run_id ?? null,
    ip: truncateIp(event.ip ?? context.ip),
    user_agent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    change: change(event),
    metadata: redactRecord(event.metadata),
  };
}
