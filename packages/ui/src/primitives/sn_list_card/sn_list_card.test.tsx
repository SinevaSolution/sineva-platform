// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNListCard } from './sn_list_card';

afterEach(cleanup);

describe('SNListCard', () => {
  it('renders title, description, leading and trailing', () => {
    render(
      <SNListCard
        title="Quarterly report"
        description="Updated today"
        leading={<span data-testid="lead" />}
        trailing={<span data-testid="trail" />}
      />,
    );
    expect(screen.getByText('Quarterly report')).toBeTruthy();
    expect(screen.getByText('Updated today')).toBeTruthy();
    expect(screen.getByTestId('lead')).toBeTruthy();
    expect(screen.getByTestId('trail')).toBeTruthy();
  });

  it('shares the SNCard look and is not interactive by default', () => {
    render(<SNListCard title="T" data-testid="card" />);
    const el = screen.getByTestId('card');
    expect(el.tagName).toBe('DIV');
    for (const cls of ['rounded-lg', 'border-border', 'bg-surface', 'flex']) {
      expect(el.className.split(' ')).toContain(cls);
    }
    expect(el.className).not.toContain('cursor-pointer');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('onClick makes a button named by the title only', () => {
    const onClick = vi.fn();
    render(<SNListCard title="Open it" description="long description" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Open it' });
    expect(button.className).toContain('cursor-pointer');
    expect(button.className).toContain('hover:bg-(--state-hover)');
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('asChild turns the child into the card, named by the title', () => {
    render(
      <SNListCard asChild title="Docs" description="Read more">
        <a href="/docs" />
      </SNListCard>,
    );
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link.getAttribute('href')).toBe('/docs');
    expect(link.className).toContain('cursor-pointer');
    expect(link.textContent).toContain('Read more');
  });

  it('links the description with aria-describedby when interactive', () => {
    render(<SNListCard title="T" description="D" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'T' });
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('appends a caller className last', () => {
    render(<SNListCard title="T" className="w-full" data-testid="card" />);
    expect(screen.getByTestId('card').className.endsWith('w-full')).toBe(true);
  });
});
