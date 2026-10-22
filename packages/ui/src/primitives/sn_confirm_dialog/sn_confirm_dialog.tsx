'use client';

import { SNButton } from '../sn_button/sn_button';
import { SNDialog } from '../sn_dialog/sn_dialog';

export interface SNConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Confirm becomes the danger variant (delete, remove). Otherwise primary. */
  destructive?: boolean;
  /**
   * The confirm action is running: cancel is disabled, confirm shows a
   * spinner, and Escape and outside press do not close the dialog. The host
   * decides when to close (after success), so a failed request keeps it open
   * for a retry.
   */
  pending?: boolean;
  /** Replaces the confirm label while pending ("Deleting..."). */
  pendingLabel?: string;
  onConfirm: () => void;
  /** Same as SNDialog: `event.preventDefault()` to place focus yourself. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function SNConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pending = false,
  pendingLabel,
  onConfirm,
  onCloseAutoFocus,
}: SNConfirmDialogProps) {
  return (
    <SNDialog
      open={open}
      onOpenChange={(next) => {
        // Gate here, not on the buttons: Escape and a press on the scrim reach
        // onOpenChange without touching any button.
        if (!pending) onOpenChange(next);
      }}
      title={title}
      description={description}
      size="sm"
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <>
          <SNButton size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </SNButton>
          <SNButton size="sm" variant={destructive ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </SNButton>
        </>
      }
    />
  );
}
