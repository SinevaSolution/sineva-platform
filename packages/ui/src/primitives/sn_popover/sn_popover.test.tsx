// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNPopover, SNPopoverContent, SNPopoverTrigger, type SNPopoverContentProps } from './sn_popover';

beforeAll(installDomPolyfills);
afterEach(cleanup);

function setup(contentProps: Partial<SNPopoverContentProps> = {}) {
  return render(
    <div>
      <SNPopover>
        <SNPopoverTrigger asChild>
          <button type="button">Open</button>
        </SNPopoverTrigger>
        <SNPopoverContent {...contentProps}>
          <p>Panel body</p>
        </SNPopoverContent>
      </SNPopover>
      <button type="button">Outside</button>
    </div>,
  );
}

describe('SNPopover', () => {
  it('renders nothing until the trigger is clicked, then opens a dialog', () => {
    setup();
    expect(screen.queryByText('Panel body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Panel body')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reflects the state in aria-expanded on the trigger', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Panel body')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a pointer press outside', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    // Radix arms its outside listener on a timeout.
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    await waitFor(() => expect(screen.queryByText('Panel body')).toBeNull());
  });

  it('uses the menu surface, the dropdown layer and a caller className last', () => {
    setup({ className: 'w-72' });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('z-(--z-popover)');
    expect(cls).toContain('bg-surface');
    expect(cls).toContain('shadow-md');
    expect(cls.endsWith('w-72')).toBe(true);
  });

  it('forwards onCloseAutoFocus', async () => {
    const onCloseAutoFocus = vi.fn();
    setup({ onCloseAutoFocus });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });
});
