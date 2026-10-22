// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_RENDERERS,
  CardRenderer,
  FallbackCard,
  resolveCardRenderer,
  type CardLabels,
  type CardRenderInput,
} from '@sineva/ui/cards';

const labels: CardLabels = {
  title: 'Heads up',
  rejected_notice: 'Could not show this result as a card.',
  no_text: 'This result could not be shown.',
  copy: 'Copy',
  copied: 'Copied',
  copy_failed: 'Could not copy',
};

const card = (over: Partial<CardRenderInput> = {}): CardRenderInput => ({
  id: 'c1',
  card_type: 'guardrail_notice',
  schema_version: 1,
  state: 'ready',
  validation_status: 'valid',
  data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
  fallback_text: 'I cannot move money. I can prepare the details for you.',
  ...over,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('fallback card renderer (WP-M0-32, FR-AX-02, FR-AX-10, FR-AX-42)', () => {
  it('is an <article> labelled by its title heading (aria-level 4)', () => {
    render(<FallbackCard card={card()} labels={labels} />);
    const article = screen.getByRole('article', { name: 'Heads up' });
    const heading = screen.getByRole('heading', { name: 'Heads up', level: 4 });
    expect(article.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.id).not.toBe('');
  });

  it('shows the fallback text as readable text', () => {
    render(<FallbackCard card={card()} labels={labels} />);
    expect(screen.getByText('I cannot move money. I can prepare the details for you.')).toBeTruthy();
    expect(screen.queryByText(labels.rejected_notice)).toBeNull();
  });

  it('gives two cards on one page different heading ids', () => {
    render(
      <>
        <FallbackCard card={card({ id: 'a' })} labels={labels} />
        <FallbackCard card={card({ id: 'b' })} labels={labels} />
      </>,
    );
    const ids = screen.getAllByRole('heading', { level: 4 }).map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('says so when a card was rejected, and when there is no text at all', () => {
    render(<FallbackCard card={card({ validation_status: 'rejected' })} labels={labels} />);
    expect(screen.getByText(labels.rejected_notice)).toBeTruthy();
    cleanup();
    render(<FallbackCard card={card({ validation_status: 'rejected', fallback_text: null })} labels={labels} />);
    expect(screen.getByText(labels.no_text)).toBeTruthy();
  });

  it('renders fallback text as text, never as HTML (no raw HTML path)', () => {
    const html = renderToStaticMarkup(
      <FallbackCard
        card={card({ fallback_text: '<img src=x onerror=alert(1)><script>alert(2)</script>' })}
        labels={labels}
      />,
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
  });

  it('never prints card data, only the fallback text', () => {
    const html = renderToStaticMarkup(
      <FallbackCard card={card({ data: { note: '<b>secret data</b>' } })} labels={labels} />,
    );
    expect(html).not.toContain('secret data');
  });

  it('copies exactly the fallback text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<FallbackCard card={card()} labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('I cannot move money. I can prepare the details for you.');
    await waitFor(() => expect(screen.getAllByText('Copied').length).toBeGreaterThan(0));
  });

  it('announces a failed copy instead of failing silently', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<FallbackCard card={card()} labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByText('Could not copy')).toBeTruthy());
  });

  it('has no copy button when there is no text to copy', () => {
    render(<FallbackCard card={card({ fallback_text: null })} labels={labels} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps a 44 px touch target on the copy button', () => {
    render(<FallbackCard card={card()} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Copy' }).className).toContain('min-h-[44px]');
  });
});

describe('static card registry (FR-AX-10)', () => {
  it('maps (card_type, major) to a component through a frozen plain object', () => {
    expect(Object.isFrozen(CARD_RENDERERS)).toBe(true);
    expect(Object.keys(CARD_RENDERERS)).toEqual(['guardrail_notice@1']);
    expect(resolveCardRenderer('guardrail_notice', 1)).toBe(CARD_RENDERERS['guardrail_notice@1']);
  });

  it('falls back for an unknown type, an unknown version and inherited property names', () => {
    expect(resolveCardRenderer('runway_metrics', 1)).toBe(FallbackCard);
    expect(resolveCardRenderer('guardrail_notice', 2)).toBe(FallbackCard);
    expect(resolveCardRenderer('__proto__', 1)).toBe(FallbackCard);
    expect(resolveCardRenderer('constructor', 1)).toBe(FallbackCard);
    expect(resolveCardRenderer('toString', 1)).toBe(FallbackCard);
  });

  it('a card that fails to render shows its fallback text instead of crashing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = () => {
      throw new Error('render failed');
    };
    render(
      <CardRenderer card={card()} labels={labels} renderers={{ 'guardrail_notice@1': broken }} />,
    );
    expect(screen.getByText('I cannot move money. I can prepare the details for you.')).toBeTruthy();
    expect(screen.getByText(labels.rejected_notice)).toBeTruthy();
  });

  it('a rejected card never reaches a type-specific component', () => {
    const typed = vi.fn(() => <p>typed</p>);
    render(
      <CardRenderer
        card={card({ validation_status: 'rejected', data: {} })}
        labels={labels}
        renderers={{ 'guardrail_notice@1': typed }}
      />,
    );
    expect(typed).not.toHaveBeenCalled();
    expect(screen.getByText(labels.rejected_notice)).toBeTruthy();
  });

  it('has no dynamic import, eval or raw HTML path anywhere in packages/ui/src/cards', () => {
    const dir = join(import.meta.dirname, '..', '..', '..', '..', 'packages', 'ui', 'src', 'cards');
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
        // Comments may mention the banned names.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const banned of [
        /\bimport\s*\(/,
        /\brequire\s*\(/,
        /\blazy\s*\(/,
        /next\/dynamic/,
        /\beval\s*\(/,
        /new\s+Function\b/,
        /dangerouslySetInnerHTML/,
        /\binnerHTML\b/,
      ]) {
        expect(source, `${file} must not match ${banned}`).not.toMatch(banned);
      }
    }
  });
});
