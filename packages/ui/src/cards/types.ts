import type * as React from 'react';

/**
 * What a card component receives. Plain values only: no HTML, no handlers, no
 * URLs to load. The platform validated `data` against the card schema before
 * it got here (ADR-0025); the fallback renderer ignores `data` on purpose.
 */
export interface SNCardRenderInput {
  id: string;
  card_type: string;
  schema_version: number;
  state: string;
  validation_status: 'valid' | 'rejected';
  data: Record<string, unknown>;
  fallback_text: string | null;
}

/**
 * Words the card chrome needs, resolved by the caller from the message
 * catalog. The ui package has no i18n of its own, so a card never hardcodes
 * a string a customer reads (ADR-0023).
 */
export interface SNCardLabels {
  /** Accessible name of the card, rendered as its heading. */
  title: string;
  /** Shown above the text when the card could not be shown as a card. */
  rejected_notice: string;
  /** Shown when there is no fallback text at all. */
  no_text: string;
  copy: string;
  copied: string;
  copy_failed: string;
}

export interface SNCardComponentProps {
  card: SNCardRenderInput;
  labels: SNCardLabels;
}

export type SNCardComponent = (props: SNCardComponentProps) => React.ReactNode;
