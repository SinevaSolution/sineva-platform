import * as React from 'react';
import { SNFallbackCard } from './sn_fallback_card';
import { resolveCardRenderer } from './registry';
import type { SNCardComponent, SNCardLabels, SNCardRenderInput } from './types';

/**
 * A render error inside a card shows its fallback text instead of taking the
 * message down with it (FR-AX-09: any failure, including render, falls back).
 */
class CardBoundary extends React.Component<
  { card: SNCardRenderInput; labels: SNCardLabels; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <SNFallbackCard card={{ ...this.props.card, validation_status: 'rejected' }} labels={this.props.labels} />;
    }
    return this.props.children;
  }
}

export function SNCardRenderer({
  card,
  labels,
  renderers,
}: {
  card: SNCardRenderInput;
  labels: SNCardLabels;
  /** Test seam. Production passes nothing and gets the static registry. */
  renderers?: Readonly<Record<string, SNCardComponent>>;
}) {
  // A rejected card never reaches a type-specific component: its data is empty.
  const Component =
    card.validation_status === 'rejected'
      ? SNFallbackCard
      : resolveCardRenderer(card.card_type, card.schema_version, renderers);
  return (
    <CardBoundary card={card} labels={labels}>
      <Component card={card} labels={labels} />
    </CardBoundary>
  );
}
