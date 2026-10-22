// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNSpinner } from './sn_spinner';

afterEach(cleanup);

describe('SNSpinner', () => {
  it('is hidden from assistive technology without a label', () => {
    const { container } = render(<SNSpinner />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces itself as a status when it has a label', () => {
    render(<SNSpinner label="Loading chats" />);
    expect(screen.getByRole('status', { name: 'Loading chats' })).toBeTruthy();
  });

  it('spins, and stops spinning under reduced motion', () => {
    const { container } = render(<SNSpinner />);
    const cls = container.querySelector('svg')?.getAttribute('class') ?? '';
    expect(cls).toContain('animate-spin');
    expect(cls).toContain('motion-reduce:animate-none');
  });

  it.each([
    ['sm', 'size-3.5'],
    ['md', 'size-4'],
    ['lg', 'size-6'],
  ] as const)('size %s', (size, cls) => {
    const { container } = render(<SNSpinner size={size} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(cls);
  });
});
