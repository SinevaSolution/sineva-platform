// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNCheckbox } from './sn_checkbox';

afterEach(cleanup);

describe('SNCheckbox', () => {
  it('is a checkbox named by its label', () => {
    render(<SNCheckbox label="Remember me" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Remember me' })).toBeTruthy();
  });

  it('reports the next value on click', () => {
    const onCheckedChange = vi.fn();
    render(<SNCheckbox label="Remember me" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('reflects checked', () => {
    render(<SNCheckbox label="Remember me" checked onCheckedChange={() => {}} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('clicking the label toggles it', () => {
    const onCheckedChange = vi.fn();
    render(<SNCheckbox label="Remember me" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByText('Remember me'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('describes the checkbox with its description', () => {
    render(<SNCheckbox label="Remember me" description="Keeps you signed in" checked={false} onCheckedChange={() => {}} />);
    const box = screen.getByRole('checkbox');
    expect(box.getAttribute('aria-describedby')).toBe(screen.getByText('Keeps you signed in').id);
  });

  it('exposes the mixed state', () => {
    render(<SNCheckbox label="All" checked={false} indeterminate onCheckedChange={() => {}} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box.getAttribute('aria-checked')).toBe('mixed');
  });

  it('can be disabled', () => {
    render(<SNCheckbox label="Remember me" checked={false} disabled onCheckedChange={() => {}} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('keeps the whole row at least 44 px tall', () => {
    const { container } = render(<SNCheckbox label="Remember me" checked={false} onCheckedChange={() => {}} />);
    expect(container.querySelector('label')?.className).toContain('min-h-11');
  });

  it('sets aria-invalid only when asked', () => {
    const { rerender } = render(<SNCheckbox label="Terms" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox').getAttribute('aria-invalid')).toBeNull();
    rerender(<SNCheckbox label="Terms" checked={false} aria-invalid onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox').getAttribute('aria-invalid')).toBe('true');
  });
});
