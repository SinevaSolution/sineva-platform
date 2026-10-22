// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNBanner } from './sn_banner';

afterEach(cleanup);

describe('SNBanner', () => {
  it.each([
    ['info', 'status', 'bg-canvas-alt text-text-secondary'],
    ['success', 'status', 'bg-surface-tint text-text'],
    ['warning', 'alert', 'bg-warning-surface text-warning'],
    ['danger', 'alert', 'bg-danger-surface text-danger'],
  ] as const)('tone %s has role %s and the FormAlert colours', (tone, role, colours) => {
    render(<SNBanner tone={tone}>Message</SNBanner>);
    const el = screen.getByRole(role);
    expect(el.className).toContain(colours);
    for (const cls of ['rounded-sm', 'px-3', 'py-2', 'text-[13px]']) {
      expect(el.className.split(' ')).toContain(cls);
    }
  });

  it('defaults to info', () => {
    render(<SNBanner>Hi</SNBanner>);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders title, body and action', () => {
    render(
      <SNBanner title="Heads up" action={<button type="button">Fix</button>}>
        Body text
      </SNBanner>,
    );
    expect(screen.getByText('Heads up').className).toContain('font-medium');
    expect(screen.getByText('Body text')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fix' })).toBeTruthy();
  });

  it('has no dismiss button without onDismiss', () => {
    render(<SNBanner>Body</SNBanner>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('dismiss button is named by dismissLabel and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <SNBanner onDismiss={onDismiss} dismissLabel="Close banner">
        Body
      </SNBanner>,
    );
    const button = screen.getByRole('button', { name: 'Close banner' });
    expect(button.className).toContain('focus-visible:outline-2');
    fireEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('appends a caller className last', () => {
    render(<SNBanner className="w-full">x</SNBanner>);
    expect(screen.getByRole('status').className.endsWith('w-full')).toBe(true);
  });
});
