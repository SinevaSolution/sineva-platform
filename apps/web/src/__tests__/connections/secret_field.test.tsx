// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNTooltipProvider } from '@sineva/ui';
import { SecretField, REVEAL_MS } from '@/client/components/connections/secret_field';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <SNTooltipProvider>
        <SecretField label="Secret API key" value={value} onChange={setValue} />
      </SNTooltipProvider>
    </I18nProvider>
  );
}

const input = () => screen.getByLabelText('Secret API key') as HTMLInputElement;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('SecretField', () => {
  it('starts masked, with the browser told not to remember or correct it', () => {
    render(<Harness />);
    expect(input().type).toBe('password');
    expect(input().autocomplete).toBe('new-password');
    expect(input().getAttribute('spellcheck')).toBe('false');
    expect(input().getAttribute('autocapitalize')).toBe('off');
  });

  it('cannot reveal an empty field', () => {
    render(<Harness />);
    const eye = screen.getByRole('button', { name: 'Show key' }) as HTMLButtonElement;
    expect(eye.disabled).toBe(true);
  });

  it('reveals on request and masks again after 30 seconds', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'xnd_secret_123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    expect(input().type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide key' }).getAttribute('aria-pressed')).toBe('true');

    act(() => void vi.advanceTimersByTime(REVEAL_MS - 1));
    expect(input().type).toBe('text');
    act(() => void vi.advanceTimersByTime(1));
    expect(input().type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show key' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('hides straight away on a second press and does not re-mask twice', () => {
    render(<Harness initial="abc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(input().type).toBe('password');
  });

  it('restarts the 30 second window when revealed again', () => {
    render(<Harness initial="abc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    act(() => void vi.advanceTimersByTime(20_000));
    fireEvent.click(screen.getByRole('button', { name: 'Hide key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    act(() => void vi.advanceTimersByTime(20_000));
    expect(input().type).toBe('text');
    act(() => void vi.advanceTimersByTime(10_000));
    expect(input().type).toBe('password');
  });

  it('masks again when the field is emptied', () => {
    render(<Harness initial="abc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    fireEvent.change(input(), { target: { value: '' } });
    expect(input().type).toBe('password');
  });

  it('trims whitespace and newlines from a paste', () => {
    render(<Harness />);
    fireEvent.paste(input(), { clipboardData: { getData: () => '  xnd_abc\n' } });
    expect(input().value).toBe('xnd_abc');
  });

  it('never writes the value to browser storage', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'super-secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    const dump = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(dump).not.toContain('super-secret-value');
  });
});
