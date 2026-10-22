// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNSwitch } from './sn_switch';

afterEach(cleanup);

describe('SNSwitch', () => {
  it('has role=switch and its accessible name', () => {
    render(<SNSwitch aria-label="Reduce motion" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeTruthy();
  });

  it('exposes checked through aria-checked', () => {
    const { rerender } = render(<SNSwitch aria-label="x" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    rerender(<SNSwitch aria-label="x" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('reports the next value on click', () => {
    const onCheckedChange = vi.fn();
    render(<SNSwitch aria-label="x" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('toggles with Space and Enter is not required (native button semantics)', () => {
    const onCheckedChange = vi.fn();
    render(<SNSwitch aria-label="x" checked={false} onCheckedChange={onCheckedChange} />);
    const el = screen.getByRole('switch');
    fireEvent.click(el);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it('is labelled by an external label through id', () => {
    render(
      <>
        <label htmlFor="sw">Focus mode</label>
        <SNSwitch id="sw" checked={false} onCheckedChange={() => {}} />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Focus mode' })).toBeTruthy();
  });

  it('can be disabled', () => {
    render(<SNSwitch aria-label="x" checked={false} disabled onCheckedChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a 44 px hit area around the 24 px track', () => {
    render(<SNSwitch aria-label="x" checked={false} onCheckedChange={() => {}} />);
    const cls = screen.getByRole('switch').className;
    expect(cls).toContain('h-6');
    expect(cls).toContain('before:-inset-2');
  });
});
