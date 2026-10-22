import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessageCards } from '@/client/components/chat/message_cards';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';
import type { MessageCardView } from '@/shared/chat_view';

const view = (over: Partial<MessageCardView> = {}): MessageCardView => ({
  id: 'c1',
  message_id: 'm1',
  position: 0,
  card_type: 'guardrail_notice',
  schema_version: 1,
  state: 'ready',
  validation_status: 'valid',
  rejected_code: null,
  provider_slug: null,
  approval_id: null,
  data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
  actions: [],
  fallback_text: 'I cannot move money. I can prepare the details for you.',
  version: 1,
  ...over,
});

const inLocale = (locale: 'en' | 'id', node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider locale={locale} messages={CATALOGS[locale]}>
      {node}
    </I18nProvider>,
  );

describe('MessageCards in the chat thread (WP-M0-32, FR-AX-02, FR-AX-42, ADR-0023)', () => {
  it('renders nothing for a message without cards', () => {
    expect(inLocale('en', <MessageCards cards={undefined} />)).toBe('');
    expect(inLocale('en', <MessageCards cards={[]} />)).toBe('');
  });

  it('renders each card as an article labelled by a localized title, with its fallback text', () => {
    const en = inLocale('en', <MessageCards cards={[view(), view({ id: 'c2', position: 1 })]} />);
    expect(en.match(/<article/g)).toHaveLength(2);
    expect(en).toContain('aria-labelledby=');
    expect(en).toContain('What I can&#x27;t do here');
    expect(en).toContain('I cannot move money. I can prepare the details for you.');
    expect(en).toContain('>Copy<');

    const id = inLocale('id', <MessageCards cards={[view()]} />);
    expect(id).toContain('Yang tidak bisa aku lakukan');
    expect(id).toContain('>Salin<');
  });

  it('uses the generic title for a type without its own title and says when a card was rejected', () => {
    const html = inLocale(
      'en',
      <MessageCards
        cards={[
          view({
            card_type: 'runway_metrics',
            validation_status: 'rejected',
            rejected_code: 'unknown_card_type',
            data: {},
          }),
        ]}
      />,
    );
    expect(html).toContain('>Result<');
    expect(html).toContain('Could not show this result as a card.');
    expect(html).toContain('I cannot move money.');
  });

  it('never prints card data', () => {
    const html = inLocale('en', <MessageCards cards={[view({ data: { note: '<b>hidden</b>' } })]} />);
    expect(html).not.toContain('hidden');
  });
});
