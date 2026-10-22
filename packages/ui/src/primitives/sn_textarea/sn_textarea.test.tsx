// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNTextarea } from './sn_textarea';

afterEach(cleanup);

const format = (count: number, max: number) => `${count} of ${max}`;

describe('SNTextarea', () => {
  it('renders a textbox with its accessible name', () => {
    render(<SNTextarea aria-label="About" />);
    expect(screen.getByRole('textbox', { name: 'About' }).tagName).toBe('TEXTAREA');
  });

  it('calls onChange', () => {
    const onChange = vi.fn();
    render(<SNTextarea aria-label="About" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('sets aria-invalid only when asked', () => {
    const { rerender } = render(<SNTextarea aria-label="About" />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
    rerender(<SNTextarea aria-label="About" aria-invalid />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a visible counter when a limit is given', () => {
    render(<SNTextarea aria-label="About" value="hello" onChange={() => {}} max={100} formatCounter={format} />);
    expect(screen.getByText('5 of 100')).toBeTruthy();
  });

  it('has no counter without a limit', () => {
    render(<SNTextarea aria-label="About" value="hello" onChange={() => {}} />);
    expect(screen.queryByText(/of/)).toBeNull();
  });

  it('keeps the live region silent below the limit', () => {
    render(<SNTextarea aria-label="About" value="hello" onChange={() => {}} max={100} formatCounter={format} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('announces the count when near the limit', () => {
    render(<SNTextarea aria-label="About" value={'x'.repeat(95)} onChange={() => {}} max={100} formatCounter={format} />);
    expect(screen.getByRole('status').textContent).toBe('95 of 100');
  });

  it('announces the count when over the limit and marks the counter as an error tone', () => {
    render(<SNTextarea aria-label="About" value={'x'.repeat(101)} onChange={() => {}} max={100} formatCounter={format} />);
    expect(screen.getByRole('status').textContent).toBe('101 of 100');
    expect(screen.getAllByText('101 of 100')[0]?.className).toContain('text-danger');
  });

  it('counts characters, not UTF-16 units', () => {
    render(<SNTextarea aria-label="About" value="ab😀" onChange={() => {}} max={10} formatCounter={format} />);
    expect(screen.getByText('3 of 10')).toBeTruthy();
  });

  it('forwards a ref', () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<SNTextarea aria-label="About" ref={ref} />);
    expect(ref.current?.tagName).toBe('TEXTAREA');
  });
});
