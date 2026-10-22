// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNSkeleton } from './sn_skeleton';

afterEach(cleanup);

describe('SNSkeleton', () => {
  it('is hidden from assistive tech', () => {
    render(<SNSkeleton data-testid="s" />);
    expect(screen.getByTestId('s').getAttribute('aria-hidden')).toBe('true');
  });

  it('animates only when motion is allowed', () => {
    render(<SNSkeleton data-testid="s" />);
    const classes = screen.getByTestId('s').className.split(' ');
    expect(classes).toContain('motion-safe:animate-pulse');
    expect(classes).not.toContain('animate-pulse');
  });

  it.each([
    ['text', 'h-3', 'rounded-xs'],
    ['circle', 'size-10', 'rounded-full'],
    ['rect', 'h-16', 'rounded-sm'],
  ] as const)('variant %s', (variant, size, radius) => {
    render(<SNSkeleton data-testid="s" variant={variant} />);
    const classes = screen.getByTestId('s').className.split(' ');
    expect(classes).toContain(size);
    expect(classes).toContain(radius);
    expect(classes).toContain('bg-canvas-alt');
  });

  it('defaults to rect and appends className last', () => {
    render(<SNSkeleton data-testid="s" className="w-1/2" />);
    const cls = screen.getByTestId('s').className;
    expect(cls).toContain('h-16');
    expect(cls.endsWith('w-1/2')).toBe(true);
  });
});
