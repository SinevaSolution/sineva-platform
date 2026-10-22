// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNStatusChip } from './sn_status_chip';

afterEach(cleanup);

describe('SNStatusChip', () => {
  it('shows the label as text and hides the dot from assistive tech', () => {
    render(<SNStatusChip tone="success" label="Connected" data-testid="c" />);
    const chip = screen.getByTestId('c');
    expect(chip.textContent).toBe('Connected');
    const dot = chip.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('rounded-full');
  });

  it.each([
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['danger', 'bg-danger'],
    ['neutral', 'bg-text-tertiary'],
    ['info', 'bg-text-brand'],
  ] as const)('tone %s colours the dot with %s', (tone, cls) => {
    render(<SNStatusChip tone={tone} label="x" data-testid="c" />);
    const dot = screen.getByTestId('c').querySelector('[aria-hidden="true"]');
    expect(dot?.className.split(' ')).toContain(cls);
  });

  it('is inline-flex with xs text and appends className last', () => {
    render(<SNStatusChip tone="neutral" label="x" data-testid="c" className="ms-1" />);
    const cls = screen.getByTestId('c').className;
    expect(cls).toContain('inline-flex');
    expect(cls).toContain('text-xs');
    expect(cls.endsWith('ms-1')).toBe(true);
  });
});
