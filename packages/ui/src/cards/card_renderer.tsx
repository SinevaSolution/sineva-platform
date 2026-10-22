import * as React from 'react';
import { FallbackCard } from './fallback_card';
import { resolveCardRenderer } from './registry';
import type { CardComponent, CardLabels, CardRenderInput } from './types';

/**
 * A render error inside a card shows its fallback text instead of taking the
 * message down with it (FR-AX-09: any failure, including render, falls back).
 */
class CardBoundary extends React.Component<
  { card: CardRenderInput; labels: CardLabels; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <FallbackCard card={{ ...this.props.card, validation_status: 'rejected' }} labels={this.props.labels} />;
    }
    return this.props.children;
  }
}

export function CardRenderer({
  card,
  labels,
  renderers,
}: {
  card: CardRenderInput;
  labels: CardLabels;
  /** Test seam. Production passes nothing and gets the static registry. */
  renderers?: Readonly<Record<string, CardComponent>>;
}) {
  // A rejected card never reaches a type-specific component: its data is empty.
  const Component =
    card.validation_status === 'rejected'
      ? FallbackCard
      : resolveCardRenderer(card.card_type, card.schema_version, renderers);
  return (
    <CardBoundary card={card} labels={labels}>
      <Component card={card} labels={labels} />
    </CardBoundary>
  );
}
