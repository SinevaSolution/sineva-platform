// What the relay needs from the card registry, without knowing which library
// validates. The platform validation is the authority (FR-AX-09): a card that
// fails here never reaches the browser or the database as a card.

export interface ValidatedCard {
  card_type: string;
  schema_version: number;
  data: Record<string, unknown>;
  actions: Array<{ id: string; kind: string; label_key: string; approval_id?: string }>;
  provider: { slug: string; account_label: string | null; connection_id: string | null } | null;
  fallback_text: string;
  payload_hash: string;
  data_expires_at: string | null;
}

export type CardCheck =
  | { ok: true; card: ValidatedCard }
  | {
      ok: false;
      code: string;
      /** The producer's fallback text when it is usable, else null. */
      fallback_text: string | null;
      /** Dotted schema paths, never values. */
      issue_paths?: string[];
    };

export interface CardValidator {
  validate(display: unknown): CardCheck;
  /** Whether `card_started` for this type and version may be forwarded. */
  supports(cardType: string, schemaVersion: unknown): boolean;
}

/** Reports a rejected card. Codes and counts only, never card content. */
export interface CardRejectionLog {
  rejected(detail: {
    code: string;
    run_handle?: string;
    issue_paths?: string[];
    cause?: unknown;
  }): void;
}
