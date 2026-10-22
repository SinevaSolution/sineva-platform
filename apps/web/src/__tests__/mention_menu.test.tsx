import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MentionMenu } from '@/client/components/chat/mention_menu';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';

const starters = ['a', 'b', 'c'] as const;
const items = [
  {
    agent_slug: 'sinofinance',
    display_name: 'SinoFinance',
    role_title: 'Spend and invoices',
    short_description: '',
    accent_key: 'finance' as const,
    room_theme_id: 'sinofinance',
    starter_prompts: starters,
  },
  {
    agent_slug: 'sinohelp',
    display_name: 'SinoHelp',
    role_title: 'Support',
    short_description: '',
    accent_key: 'help' as const,
    room_theme_id: 'sinohelp',
    starter_prompts: starters,
  },
];

const noop = () => {};

const inLocale = (locale: 'en' | 'id', node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider locale={locale} messages={CATALOGS[locale]}>
      {node}
    </I18nProvider>,
  );

describe('MentionMenu', () => {
  it('renders a listbox of options with stable ids and the active one selected', () => {
    const html = inLocale(
      'en',
      <MentionMenu id="m" items={items} activeIndex={1} query="" onSelect={noop} onHover={noop} />,
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain('id="m-opt-0"');
    expect(html).toContain('id="m-opt-1"');
    expect(html).toMatch(/id="m-opt-1"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="m-opt-1"/);
    expect(html).toContain('SinoFinance');
    expect(html).toContain('Spend and invoices');
    expect(html).toContain('Bring in a specialist');
  });

  it('shows an empty state with the query when nothing matches', () => {
    const html = inLocale(
      'en',
      <MentionMenu id="m" items={[]} activeIndex={0} query="zzz" onSelect={noop} onHover={noop} />,
    );
    expect(html).toContain('No specialist matches');
    expect(html).toContain('zzz');
    expect(html).not.toContain('role="option"');
  });

  it('speaks Indonesian when the locale is id', () => {
    const html = inLocale(
      'id',
      <MentionMenu id="m" items={items} activeIndex={0} query="" onSelect={noop} onHover={noop} />,
    );
    expect(html).toContain('Panggil spesialis');
    expect(html).not.toContain('Bring in a specialist');
  });
});
