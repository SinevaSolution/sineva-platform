// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNButton } from './sn_button';

afterEach(cleanup);

describe('SNButton', () => {
  it('renders a button with its accessible name and type=button by default', () => {
    render(<SNButton>Save</SNButton>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('type')).toBe('button');
  });

  it('keeps type=submit when asked', () => {
    render(<SNButton type="submit">Send</SNButton>);
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('type')).toBe('submit');
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<SNButton onClick={onClick}>Go</SNButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['primary', 'bg-action-primary'],
    ['dark', 'bg-action-dark'],
    ['secondary', 'border-border-strong'],
    ['ghost', 'text-text-secondary'],
    ['danger', 'bg-danger'],
    ['link', 'underline'],
  ] as const)('variant %s carries its token class', (variant, cls) => {
    render(<SNButton variant={variant}>x</SNButton>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('defaults to the secondary variant at md (40 px)', () => {
    render(<SNButton>x</SNButton>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('border-border-strong');
    expect(cls).toContain('h-10');
  });

  it('md becomes 44 px on coarse pointers', () => {
    render(<SNButton size="md">x</SNButton>);
    expect(screen.getByRole('button').className).toContain('pointer-coarse:h-11');
  });

  it.each(['xs', 'sm'] as const)('size %s keeps a small box and a 44 px hit area', (size) => {
    render(<SNButton size={size}>x</SNButton>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('relative');
    expect(cls).toContain('after:h-11');
  });

  it('lg is 44 px', () => {
    render(<SNButton size="lg">x</SNButton>);
    expect(screen.getByRole('button').className).toContain('h-11');
  });

  it('shape pill uses the pill radius, square the 10 px radius', () => {
    const { rerender } = render(<SNButton shape="pill">x</SNButton>);
    expect(screen.getByRole('button').className).toContain('rounded-pill');
    rerender(<SNButton shape="square">x</SNButton>);
    expect(screen.getByRole('button').className).toContain('rounded-sm');
  });

  it('loading keeps the label, sets aria-busy and ignores clicks', () => {
    const onClick = vi.fn();
    render(
      <SNButton loading onClick={onClick}>
        Save
      </SNButton>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is not busy when not loading', () => {
    render(<SNButton>Save</SNButton>);
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBeNull();
  });

  it('disabled sets the disabled attribute', () => {
    render(<SNButton disabled>Save</SNButton>);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a link through asChild', () => {
    render(
      <SNButton asChild variant="primary">
        <a href="/docs">Docs</a>
      </SNButton>,
    );
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link.getAttribute('href')).toBe('/docs');
    expect(link.className).toContain('bg-action-primary');
    expect(link.getAttribute('type')).toBeNull();
  });

  it('appends a caller className last', () => {
    render(<SNButton className="w-full">x</SNButton>);
    expect(screen.getByRole('button').className.endsWith('w-full')).toBe(true);
  });

  it('forwards a ref to the button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<SNButton ref={ref}>x</SNButton>);
    expect(ref.current?.tagName).toBe('BUTTON');
  });
});
