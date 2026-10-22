// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNProgressBar } from './sn_progress_bar';

afterEach(cleanup);

describe('SNProgressBar', () => {
  it('is a progressbar named by label with value, min and max', () => {
    render(<SNProgressBar label="Uploading" value={40} />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('fills the track by percentage with a brand fill on a canvas-alt track', () => {
    render(<SNProgressBar label="x" value={40} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('bg-canvas-alt');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain('bg-action-primary');
    expect(fill.style.width).toBe('40%');
  });

  it('honours a custom max', () => {
    render(<SNProgressBar label="x" value={5} max={20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuemax')).toBe('20');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('25%');
  });

  it('clamps out-of-range values', () => {
    const { rerender } = render(<SNProgressBar label="x" value={150} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    rerender(<SNProgressBar label="x" value={-5} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('is indeterminate without a value: no aria-valuenow, animation only when motion is allowed', () => {
    render(<SNProgressBar label="Loading" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className.split(' ')).toContain('motion-safe:animate-pulse');
    expect(fill.className.split(' ')).not.toContain('animate-pulse');
  });

  it('appends a caller className last', () => {
    render(<SNProgressBar label="x" value={1} className="w-48" />);
    expect(screen.getByRole('progressbar').className.endsWith('w-48')).toBe(true);
  });
});
