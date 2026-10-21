import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MentionMenu } from '@/client/components/chat/mention_menu';

const items = [
  { agent_slug: 'sinofinance', display_name: 'SinoFinance', role_title: 'Spend and invoices', short_description: '' },
  { agent_slug: 'sinohelp', display_name: 'SinoHelp', role_title: 'Support', short_description: '' },
];

const noop = () => {};

describe('MentionMenu', () => {
  it('renders a listbox of options with stable ids and the active one selected', () => {
    const html = renderToStaticMarkup(
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
    const html = renderToStaticMarkup(
      <MentionMenu id="m" items={[]} activeIndex={0} query="zzz" onSelect={noop} onHover={noop} />,
    );
    expect(html).toContain('No specialist matches');
    expect(html).toContain('zzz');
    expect(html).not.toContain('role="option"');
  });
});
