import { createHash } from 'node:crypto';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { KNOWN_ANNOTATIONS, lintSchema } from './schema_lint';
import { checkTypedStrings, sanitizeData, stripInvisible } from './typed_strings';

export interface CardSchemaEntry {
  card_type: string;
  version: number;
  schema: Record<string, unknown>;
}

/**
 * Pure function that moves card data from version `from` to version `to`.
 * Only N-1 to N is supported; an older row is rejected, not chained.
 */
export interface CardUpcaster {
  card_type: string;
  from: number;
  to: number;
  upcast(data: unknown): unknown;
}

/** Why a card was rejected. These strings are logged as `card.rejected` codes and stored on the row. */
export type CardRejectCode =
  | 'display_missing'
  | 'too_large'
  | 'unknown_card_type'
  | 'unsupported_version'
  | 'fallback_missing'
  | 'schema_invalid'
  | 'bad_link'
  | 'bad_contact'
  | 'bad_media_ref'
  | 'untyped_url'
  | 'upcast_failed'
  | 'too_many_cards';

export const ACTION_KINDS = [
  'approve',
  'edit',
  'ask_changes',
  'reject',
  'copy',
  'download',
  'open_external',
  'save_to_library',
  'send_to_chat',
  'connect_tool',
  'retry',
  'expand',
  'dismiss',
  'mark_reviewed',
  'export',
] as const;
export type CardActionKind = (typeof ACTION_KINDS)[number];

export interface CardAction {
  id: string;
  kind: CardActionKind;
  label_key: string;
  approval_id?: string;
}

export interface CardProvider {
  slug: string;
  account_label: string | null;
  connection_id: string | null;
}

export interface ValidCard {
  card_type: string;
  schema_version: number;
  data: Record<string, unknown>;
  actions: CardAction[];
  provider: CardProvider | null;
  fallback_text: string;
  /** sha256 of the canonical JSON of `data`, for approval-bound cards (FR-INBOX-09). */
  payload_hash: string;
  /** From the schema's root `x-ttl`; null when the schema has none. */
  data_expires_at: string | null;
}

export type CardValidationResult =
  | { ok: true; card: ValidCard }
  | {
      ok: false;
      code: CardRejectCode;
      /** The producer's fallback text when it is usable, else null. */
      fallback_text: string | null;
      /** Dotted paths of schema failures. Never the failing values. */
      issue_paths?: string[];
    };

export interface CardRegistry {
  validateDisplay(input: unknown, options?: { now?: Date }): CardValidationResult;
  /** Newest version for a type, or null when the type is unknown. */
  latestVersion(cardType: string): number | null;
  cardTypes(): string[];
}

/** FR-AX-09: one card is at most 64 KB serialized. */
export const MAX_CARD_BYTES = 64 * 1024;
/** FR-AX-09: one message carries at most 40 cards. */
export const MAX_CARDS_PER_MESSAGE = 40;
const MAX_FALLBACK_TEXT = 4_000;

const KEY = '^[a-z][a-z0-9_.]*$';
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

// The envelope around `data` (FR-AX-06). Written here, not as a schema file,
// because it is the same for every card type and not part of the per-type
// contract that is copied into sineva-ai.
const ENVELOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['card_type', 'schema_version', 'data', 'actions', 'provider', 'fallback_text'],
  properties: {
    card_type: { type: 'string', maxLength: 64 },
    schema_version: {},
    data: { type: 'object' },
    actions: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'label_key'],
        properties: {
          id: { type: 'string', pattern: KEY, maxLength: 64 },
          kind: { enum: [...ACTION_KINDS] },
          label_key: { type: 'string', pattern: KEY, maxLength: 80 },
          approval_id: { type: 'string', pattern: UUID_PATTERN },
        },
      },
    },
    provider: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['slug', 'account_label', 'connection_id'],
          properties: {
            slug: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', maxLength: 40 },
            account_label: { type: ['string', 'null'], maxLength: 120 },
            connection_id: { type: ['string', 'null'], pattern: UUID_PATTERN },
          },
        },
      ],
    },
    fallback_text: { type: 'string' },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseVersion(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 ? value : null;
  if (typeof value === 'string') {
    const match = /^(\d+)(?:\.\d+){0,2}$/.exec(value);
    if (match) {
      const major = Number(match[1]);
      return major >= 1 ? major : null;
    }
  }
  return null;
}

function ttlMillis(schema: Record<string, unknown>): number | null {
  const ttl = schema['x-ttl'];
  if (typeof ttl !== 'string') return null;
  const match = /^(\d+)([hd])$/.exec(ttl);
  if (!match) return null;
  return Number(match[1]) * (match[2] === 'd' ? 86_400_000 : 3_600_000);
}

function issuePaths(validate: ValidateFunction): string[] {
  const paths = (validate.errors ?? []).map((error) => error.instancePath || '/');
  return [...new Set(paths)].slice(0, 10);
}

interface CompiledEntry extends CardSchemaEntry {
  validate: ValidateFunction;
}

export function createCardRegistry(options: {
  schemas: CardSchemaEntry[];
  upcasters?: CardUpcaster[];
}): CardRegistry {
  // strict: unknown keywords and formats throw instead of being ignored, so a
  // typo in a schema cannot silently drop a constraint. No `$data` and no
  // remote `$ref`: the registry never fetches anything.
  const ajv = new Ajv2020({
    strict: true,
    allErrors: false,
    validateFormats: false,
    allowUnionTypes: true,
  });
  for (const annotation of KNOWN_ANNOTATIONS) {
    ajv.addKeyword({ keyword: annotation, schemaType: ['boolean', 'string'] });
  }
  const validateEnvelope = ajv.compile(ENVELOPE_SCHEMA);

  const byType = new Map<string, Map<number, CompiledEntry>>();
  for (const entry of options.schemas) {
    lintSchema(entry.schema, `${entry.card_type} v${entry.version}`);
    const versions = byType.get(entry.card_type) ?? new Map<number, CompiledEntry>();
    if (versions.has(entry.version)) {
      throw new Error(`card schema ${entry.card_type} v${entry.version} is registered twice`);
    }
    versions.set(entry.version, { ...entry, validate: ajv.compile(entry.schema) });
    byType.set(entry.card_type, versions);
  }

  const latestOf = (cardType: string): number | null => {
    const versions = byType.get(cardType);
    return versions ? Math.max(...versions.keys()) : null;
  };

  /** Sanitise, validate and typed-check data against one schema version. */
  function checkData(
    entry: CompiledEntry,
    data: unknown,
  ): { ok: true; data: Record<string, unknown> } | { ok: false; code: CardRejectCode; issue_paths?: string[] } {
    const clean = sanitizeData(entry.schema, data);
    if (!entry.validate(clean)) {
      return { ok: false, code: 'schema_invalid', issue_paths: issuePaths(entry.validate) };
    }
    const typed = checkTypedStrings(entry.schema, clean);
    if (typed) return { ok: false, code: typed };
    return { ok: true, data: clean as Record<string, unknown> };
  }

  function validateDisplay(input: unknown, opts: { now?: Date } = {}): CardValidationResult {
    const reject = (
      code: CardRejectCode,
      fallback: string | null,
      extra: { issue_paths?: string[] } = {},
    ): CardValidationResult => ({ ok: false, code, fallback_text: fallback, ...extra });

    if (!isRecord(input)) return reject('display_missing', null);

    // The producer's fallback text, kept for any rejection below when usable.
    const rawFallback = input['fallback_text'];
    const fallback =
      typeof rawFallback === 'string' ? stripInvisible(rawFallback).trim() : '';
    const usableFallback = fallback !== '' && fallback.length <= MAX_FALLBACK_TEXT ? fallback : null;

    // Size first: it is the cheap check and bounds the work of every later one.
    let bytes: number;
    try {
      bytes = new TextEncoder().encode(JSON.stringify(input)).length;
    } catch {
      return reject('schema_invalid', usableFallback);
    }
    if (bytes > MAX_CARD_BYTES) return reject('too_large', usableFallback);

    const cardType = input['card_type'];
    const versions = typeof cardType === 'string' ? byType.get(cardType) : undefined;
    if (typeof cardType !== 'string' || !versions) return reject('unknown_card_type', usableFallback);

    const version = parseVersion(input['schema_version']);
    const latest = latestOf(cardType) as number;
    if (version === null) return reject('unsupported_version', usableFallback);

    let upcaster: CardUpcaster | undefined;
    if (version !== latest) {
      // N-1 only, and only with a pure upcaster to N.
      upcaster =
        version === latest - 1
          ? options.upcasters?.find(
              (u) => u.card_type === cardType && u.from === version && u.to === latest,
            )
          : undefined;
      if (!upcaster || !versions.has(version)) return reject('unsupported_version', usableFallback);
    }

    if (usableFallback === null) return reject('fallback_missing', null);

    // Defaults for the two optional envelope parts, so a producer that omits
    // an empty list or a null provider is not rejected for it.
    const envelope = { actions: [], provider: null, ...input, fallback_text: usableFallback };
    if (!validateEnvelope(envelope)) {
      return reject('schema_invalid', usableFallback, { issue_paths: issuePaths(validateEnvelope) });
    }

    const own = versions.get(version) as CompiledEntry;
    const checked = checkData(own, input['data']);
    if (!checked.ok) {
      return reject(checked.code, usableFallback, checked.issue_paths ? { issue_paths: checked.issue_paths } : {});
    }

    let data = checked.data;
    let finalVersion = version;
    if (upcaster) {
      let upcast: unknown;
      try {
        // A clone, so an upcaster that mutates its argument cannot touch the input.
        upcast = upcaster.upcast(structuredClone(data));
      } catch {
        return reject('upcast_failed', usableFallback);
      }
      const upgraded = checkData(versions.get(latest) as CompiledEntry, upcast);
      if (!upgraded.ok) return reject('upcast_failed', usableFallback);
      data = upgraded.data;
      finalVersion = latest;
    }

    const now = opts.now ?? new Date();
    const ttl = ttlMillis((versions.get(finalVersion) as CompiledEntry).schema);
    const provider = envelope.provider as CardProvider | null;
    return {
      ok: true,
      card: {
        card_type: cardType,
        schema_version: finalVersion,
        data,
        actions: envelope.actions as CardAction[],
        provider: provider
          ? {
              ...provider,
              account_label: provider.account_label === null ? null : stripInvisible(provider.account_label),
            }
          : null,
        fallback_text: usableFallback,
        payload_hash: createHash('sha256').update(canonicalJson(data)).digest('hex'),
        data_expires_at: ttl === null ? null : new Date(now.getTime() + ttl).toISOString(),
      },
    };
  }

  return {
    validateDisplay,
    latestVersion: latestOf,
    cardTypes: () => [...byType.keys()].sort(),
  };
}
