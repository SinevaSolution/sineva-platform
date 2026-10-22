// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNConfirmDialog, type SNConfirmDialogProps } from './sn_confirm_dialog';

beforeAll(installDomPolyfills);
afterEach(cleanup);

function setup(props: Partial<SNConfirmDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <SNConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete chat?"
      description="This cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onOpenChange, onConfirm };
}

describe('SNConfirmDialog', () => {
  it('is a dialog with title, description and two named buttons', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Delete chat?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('confirm is primary by default and danger when destructive', () => {
    const { unmount } = render(
      <SNConfirmDialog open onOpenChange={() => {}} title="t" description="d" confirmLabel="Go" cancelLabel="No" onConfirm={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('bg-action-primary');
    unmount();
    setup({ destructive: true });
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger');
  });

  it('uses small buttons right-aligned in a row', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('h-9');
    const row = button.parentElement as HTMLElement;
    expect(row.className).toContain('mt-5 flex justify-end gap-2');
  });

  it('fires onConfirm exactly once per click', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel asks to close', () => {
    const { onOpenChange, onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape asks to close when idle', () => {
    const { onOpenChange } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  describe('pending', () => {
    it('disables cancel, puts confirm in loading and swaps the label', () => {
      setup({ pending: true, pendingLabel: 'Deleting...' });
      expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
      const confirm = screen.getByRole('button', { name: 'Deleting...' });
      expect(confirm.getAttribute('aria-busy')).toBe('true');
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });

    it('keeps the confirm label when no pendingLabel is given', () => {
      setup({ pending: true });
      expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('aria-busy')).toBe('true');
    });

    it('blocks Escape and outside close', () => {
      const { onOpenChange } = setup({ pending: true });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      fireEvent.pointerDown(document.body);
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('does not fire onConfirm again while pending', () => {
      const { onConfirm } = setup({ pending: true });
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  it('forwards onCloseAutoFocus', async () => {
    const onCloseAutoFocus = vi.fn();
    const props = {
      title: 't',
      description: 'd',
      confirmLabel: 'Go',
      cancelLabel: 'No',
      onConfirm: () => {},
      onOpenChange: () => {},
      onCloseAutoFocus,
    };
    const { rerender } = render(<SNConfirmDialog open {...props} />);
    rerender(<SNConfirmDialog open={false} {...props} />);
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });
});
