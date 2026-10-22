// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNBadge, type SNBadgeTone } from './sn_badge';

afterEach(cleanup);

const STATUS: SNBadgeTone[] = ['review', 'running', 'paused', 'failed'];
const PLAIN: SNBadgeTone[] = ['neutral', 'brand', 'success', 'warning', 'danger'];

describe('SNBadge', () => {
  it('is an inline-flex pill with xs medium text', () => {
    render(<SNBadge data-testid="b">New</SNBadge>);
    const classes = screen.getByTestId('b').className.split(' ');
    for (const cls of ['inline-flex', 'rounded-pill', 'text-xs', 'font-medium']) expect(classes).toContain(cls);
  });

  it.each([
    ['neutral', 'bg-canvas-alt'],
    ['brand', 'bg-surface-tint'],
    ['success', 'bg-success-surface'],
    ['warning', 'bg-warning-surface'],
    ['danger', 'bg-danger-surface'],
  ] as const)('tone %s uses %s', (tone, cls) => {
    render(
      <SNBadge data-testid="b" tone={tone}>
        x
      </SNBadge>,
    );
    expect(screen.getByTestId('b').className).toContain(cls);
  });

  it.each(PLAIN)('plain tone %s renders no icon', (tone) => {
    render(
      <SNBadge data-testid="b" tone={tone}>
        x
      </SNBadge>,
    );
    expect(screen.getByTestId('b').querySelector('svg')).toBeNull();
  });

  it.each(STATUS)('status tone %s always renders an aria-hidden icon next to the text', (tone) => {
    render(
      <SNBadge data-testid="b" tone={tone}>
        Label
      </SNBadge>,
    );
    const el = screen.getByTestId('b');
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(el.textContent).toBe('Label');
  });

  it('accepts an icon override that stays aria-hidden', () => {
    render(
      <SNBadge data-testid="b" tone="review" icon={<svg data-testid="custom" />}>
        x
      </SNBadge>,
    );
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(screen.getByTestId('b').querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByTestId('custom').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to neutral and appends className last', () => {
    render(
      <SNBadge data-testid="b" className="ms-2">
        x
      </SNBadge>,
    );
    const cls = screen.getByTestId('b').className;
    expect(cls).toContain('bg-canvas-alt');
    expect(cls.endsWith('ms-2')).toBe(true);
  });
});
