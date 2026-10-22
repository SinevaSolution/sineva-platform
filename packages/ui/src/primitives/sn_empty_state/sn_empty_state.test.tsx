// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Inbox } from 'lucide-react';
import { SNEmptyState } from './sn_empty_state';

afterEach(cleanup);

describe('SNEmptyState', () => {
  it('renders title as an h2 by default, plus the description', () => {
    render(<SNEmptyState title="No chats yet" description="Start one to see it here." />);
    expect(screen.getByRole('heading', { level: 2, name: 'No chats yet' })).toBeTruthy();
    expect(screen.getByText('Start one to see it here.')).toBeTruthy();
  });

  it('headingLevel changes the heading element', () => {
    render(<SNEmptyState title="T" description="D" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'T' })).toBeTruthy();
  });

  it('shows the relaxed Sino by default and another pose on request', () => {
    const { container, rerender } = render(<SNEmptyState title="T" description="D" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('sino-relaxed');
    rerender(<SNEmptyState title="T" description="D" pose="thumbs-up" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('sino-thumbs-up');
  });

  it('renders a single optional action', () => {
    const { rerender } = render(
      <SNEmptyState title="T" description="D" action={<button type="button">New chat</button>} />,
    );
    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy();
    rerender(<SNEmptyState title="T" description="D" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a centered stack and appends className last', () => {
    const { container } = render(<SNEmptyState title="T" description="D" className="py-8" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    for (const c of ['flex', 'flex-col', 'items-center', 'text-center']) expect(cls.split(' ')).toContain(c);
    expect(cls.endsWith('py-8')).toBe(true);
  });

  it('shows an icon in a tinted circle instead of Sino when `icon` is given', () => {
    const { container } = render(<SNEmptyState title="T" description="D" icon={Inbox} />);
    expect(container.querySelector('img')).toBeNull();
    const badge = container.querySelector('[data-slot="empty-icon"]');
    expect(badge).toBeTruthy();
    expect(badge?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has three sizes; sm is a compact row-friendly stack', () => {
    const { container, rerender } = render(<SNEmptyState title="T" description="D" icon={Inbox} size="sm" />);
    expect((container.firstElementChild as HTMLElement).dataset.size).toBe('sm');
    rerender(<SNEmptyState title="T" description="D" size="lg" />);
    expect((container.firstElementChild as HTMLElement).dataset.size).toBe('lg');
    rerender(<SNEmptyState title="T" description="D" />);
    expect((container.firstElementChild as HTMLElement).dataset.size).toBe('md');
  });

  it('announces itself as a status region for assistive tech', () => {
    const { container } = render(<SNEmptyState title="T" description="D" />);
    expect((container.firstElementChild as HTMLElement).getAttribute('role')).toBe('status');
  });
});

