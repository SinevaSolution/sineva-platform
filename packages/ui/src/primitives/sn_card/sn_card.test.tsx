// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNCard } from './sn_card';

afterEach(cleanup);

describe('SNCard', () => {
  it('renders a div with the base surface look', () => {
    render(<SNCard data-testid="c">x</SNCard>);
    const el = screen.getByTestId('c');
    expect(el.tagName).toBe('DIV');
    for (const cls of ['rounded-lg', 'border', 'border-border', 'bg-surface']) {
      expect(el.className.split(' ')).toContain(cls);
    }
  });

  it.each([
    ['none', null],
    ['sm', 'p-3'],
    ['md', 'p-4'],
    ['lg', 'p-6'],
  ] as const)('padding %s', (padding, cls) => {
    render(<SNCard data-testid="c" padding={padding} />);
    const classes = screen.getByTestId('c').className.split(' ');
    if (cls) expect(classes).toContain(cls);
    else expect(classes.some((c) => /^p-\d/.test(c))).toBe(false);
  });

  it('defaults to md padding', () => {
    render(<SNCard data-testid="c" />);
    expect(screen.getByTestId('c').className.split(' ')).toContain('p-4');
  });

  it('elevated adds a shadow, flat does not', () => {
    const { rerender } = render(<SNCard data-testid="c" elevated />);
    expect(screen.getByTestId('c').className).toContain('shadow-sm');
    rerender(<SNCard data-testid="c" />);
    expect(screen.getByTestId('c').className).not.toContain('shadow-sm');
  });

  it('non-interactive has no pointer, hover or focus styling', () => {
    render(<SNCard data-testid="c" />);
    const cls = screen.getByTestId('c').className;
    expect(cls).not.toContain('cursor-pointer');
    expect(cls).not.toContain('hover:');
    expect(cls).not.toContain('focus-visible');
  });

  it('interactive gets pointer, hover state and focus ring', () => {
    render(<SNCard data-testid="c" interactive />);
    const cls = screen.getByTestId('c').className;
    expect(cls).toContain('cursor-pointer');
    expect(cls).toContain('hover:bg-(--state-hover)');
    expect(cls).toContain('focus-visible:outline-2');
  });

  it('renders through asChild as a link', () => {
    render(
      <SNCard interactive asChild>
        <a href="/x">Open</a>
      </SNCard>,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link.className).toContain('cursor-pointer');
    expect(link.className).toContain('bg-surface');
  });

  it('appends a caller className last and forwards a ref', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<SNCard ref={ref} data-testid="c" className="w-full" />);
    expect(screen.getByTestId('c').className.endsWith('w-full')).toBe(true);
    expect(ref.current?.tagName).toBe('DIV');
  });
});
