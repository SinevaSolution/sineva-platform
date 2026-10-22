// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNErrorState } from './sn_error_state';

afterEach(cleanup);

const base = { title: 'Something broke', message: 'Try again in a moment.' };

describe('SNErrorState', () => {
  it('is an alert with the title, message and the confused Sino', () => {
    const { container } = render(<SNErrorState {...base} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Something broke');
    expect(screen.getByRole('heading', { level: 2, name: 'Something broke' })).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('sino-confused');
  });

  it('renders exactly the message it is given', () => {
    render(<SNErrorState title="T" message="Sino isn't answering right now." />);
    expect(screen.getByText("Sino isn't answering right now.")).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe("TSino isn't answering right now.");
  });

  it('retry button calls onRetry', () => {
    const onRetry = vi.fn();
    render(<SNErrorState {...base} onRetry={onRetry} retryLabel="Try again" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry button without onRetry', () => {
    render(<SNErrorState {...base} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the request id in mono with its label', () => {
    render(<SNErrorState {...base} requestId="req_123" requestIdLabel="Request ID" />);
    expect(screen.getByText('Request ID')).toBeTruthy();
    expect(screen.getByText('req_123').className).toContain('font-mono');
  });

  it('omits the request id block when there is none', () => {
    render(<SNErrorState {...base} />);
    expect(screen.getByRole('alert').querySelector('.font-mono')).toBeNull();
  });
});
