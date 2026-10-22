'use client';

import { CardRenderer, type CardLabels } from '@sineva/ui/cards';
import { useTranslations } from '@/i18n/provider';
import type { MessageCardView } from '@/shared/chat_view';

/**
 * The cards of one assistant message, under its text. M0 renders every card
 * through the fallback renderer; the typed components arrive with the card
 * catalog. Cards are plain `<article>` blocks: model text is never rendered
 * as HTML here (FR-AX-02, no raw HTML path).
 */
export function MessageCards({ cards }: { cards: MessageCardView[] | undefined }) {
  const t = useTranslations('cards');
  if (!cards || cards.length === 0) return null;

  // The title is a name per card type. Literal keys only (ADR-0023): a type
  // without its own entry reads as a generic "Result".
  const titleFor = (cardType: string): string => {
    switch (cardType) {
      case 'guardrail_notice':
        return t('title.guardrail_notice');
      default:
        return t('title.generic');
    }
  };
  const common = {
    rejected_notice: t('rejected_notice'),
    no_text: t('no_text'),
    copy: t('copy'),
    copied: t('copied'),
    copy_failed: t('copy_failed'),
  };

  return (
    <>
      {cards.map((card) => {
        const labels: CardLabels = { ...common, title: titleFor(card.card_type) };
        return (
          <CardRenderer
            key={card.id}
            labels={labels}
            card={{
              id: card.id,
              card_type: card.card_type,
              schema_version: card.schema_version,
              state: card.state,
              validation_status: card.validation_status,
              data: card.data,
              fallback_text: card.fallback_text,
            }}
          />
        );
      })}
    </>
  );
}
