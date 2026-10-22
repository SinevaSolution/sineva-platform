// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNDialog, type SNDialogProps } from './sn_dialog';

beforeAll(installDomPolyfills);
afterEach(cleanup);

// A controlled host with a real opener button so focus return is observable.
function Host(props: Partial<SNDialogProps> & { onChange?: (open: boolean) => void }) {
  const { onChange, ...rest } = props;
  const [open, setOpen] = React.useState(false);
  return (
    <SNTooltipProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Opener
      </button>
      <SNDialog
        title="Rename chat"
        {...rest}
        open={open}
        onOpenChange={(next) => {
          onChange?.(next);
          setOpen(next);
        }}
      >
        <input aria-label="Name" />
      </SNDialog>
    </SNTooltipProvider>
  );
}

function openIt() {
  const opener = screen.getByRole('button', { name: 'Opener' });
  // fireEvent.click does not move focus the way a real click does, and Radix
  // returns focus to whatever was focused when the dialog opened.
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('SNDialog', () => {
  it('renders nothing while closed', () => {
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a dialog named by its title', () => {
    render(<Host />);
    openIt();
    expect(screen.getByRole('dialog', { name: 'Rename chat' })).toBeTruthy();
  });

  it('hideTitle keeps the name but makes the title sr-only', () => {
    render(<Host hideTitle />);
    openIt();
    expect(screen.getByRole('dialog', { name: 'Rename chat' })).toBeTruthy();
    expect(screen.getByText('Rename chat').className).toContain('sr-only');
  });

  it('shows the title visibly by default', () => {
    render(<Host />);
    openIt();
    expect(screen.getByText('Rename chat').className).not.toContain('sr-only');
  });

  it('wires the description with aria-describedby', () => {
    render(<Host description="Pick a new name." />);
    openIt();
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe('Pick a new name.');
  });

  it('leaves aria-describedby off without a description', () => {
    render(<Host />);
    openIt();
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });

  it('asks to close on Escape', async () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    openIt();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('moves focus into the dialog and returns it to the opener on close', async () => {
    render(<Host />);
    const opener = openIt();
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Radix returns focus on a zero-delay timeout after unmount.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('forwards onCloseAutoFocus', async () => {
    const onCloseAutoFocus = vi.fn();
    render(<Host onCloseAutoFocus={onCloseAutoFocus} />);
    openIt();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });

  it('renders the footer node', () => {
    render(<Host footer={<button type="button">Save</button>} />);
    openIt();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('has no close button without closeLabel', () => {
    render(<Host />);
    openIt();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('renders a named close button at the top end when closeLabel is given, and it closes', async () => {
    const onChange = vi.fn();
    render(<Host closeLabel="Close" onChange={onChange} />);
    openIt();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.className).toContain('absolute');
    fireEvent.click(close);
    expect(onChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses the app dialog surface and a scrim above the page', () => {
    render(<Host />);
    openIt();
    const cls = screen.getByRole('dialog').className;
    for (const part of ['fixed', 'start-1/2', 'top-1/2', 'z-(--z-modal)', 'rtl:translate-x-1/2', 'rounded-md', 'bg-surface', 'p-5', 'shadow-md']) {
      expect(cls).toContain(part);
    }
    expect(document.querySelector('.bg-scrim')?.className).toContain('z-(--z-modal)');
  });

  it('size sm is max-w-sm and md is the dialog width token', () => {
    const { unmount } = render(<Host size="sm" />);
    openIt();
    expect(screen.getByRole('dialog').className).toContain('max-w-sm');
    unmount();
    render(<Host size="md" />);
    openIt();
    expect(screen.getByRole('dialog').className).toContain('max-w-[var(--width-dialog)]');
  });
});
