'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { SNIconButton } from '../sn_icon_button/sn_icon_button';

export type SNDialogSize = 'sm' | 'md';

export interface SNDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the dialog. Required: a dialog without a name is unusable with a screen reader. */
  title: string;
  /** Keeps the title for assistive tech but hides it visually. */
  hideTitle?: boolean;
  description?: string;
  /** The body, between the description and the footer. */
  children?: React.ReactNode;
  /** Right-aligned action row (`mt-5 flex justify-end gap-2`). Pass buttons. */
  footer?: React.ReactNode;
  /**
   * Accessible name of the top-end close button. The button exists only when
   * this is given. It is an SNIconButton, so an SNTooltipProvider must be
   * mounted above the dialog (the portal keeps React context, so one near the
   * app root is enough).
   */
  closeLabel?: string;
  /**
   * Runs when the dialog closes, before focus returns to the opener.
   * `event.preventDefault()` keeps focus where you move it yourself.
   */
  onCloseAutoFocus?: (event: Event) => void;
  size?: SNDialogSize;
}

const SIZES: Record<SNDialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-[var(--width-dialog)]',
};

// Surface copied from the app's delete dialog. rtl:translate-x-1/2 flips the
// horizontal centering because `start-1/2` anchors to the right edge in RTL.
const SURFACE =
  'fixed start-1/2 top-1/2 z-(--z-modal) w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2 rounded-md border border-border bg-surface p-5 shadow-md';

// Radix Dialog returns focus to its own `Dialog.Trigger`. These components are
// controlled and have no Trigger, so Radix would drop focus on <body>. Remember
// what had focus when the dialog opened and give it back on close. A layout
// effect, because Radix moves focus into the content in a passive effect that
// runs later in the same open. Gotcha: if the opener unmounted meanwhile (a
// menu item), nothing is restored; pass `onCloseAutoFocus` and place focus.
function useRestoreFocus(open: boolean, onCloseAutoFocus?: (event: Event) => void) {
  const openerRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return (event: Event) => {
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
  };
}

function CloseIcon() {
  // Inline so the package needs no icon dependency for one glyph.
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function SNDialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  closeLabel,
  onCloseAutoFocus,
  size = 'md',
}: SNDialogProps) {
  const handleCloseAutoFocus = useRestoreFocus(open, onCloseAutoFocus);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-modal) bg-scrim" />
        <DialogPrimitive.Content
          onCloseAutoFocus={handleCloseAutoFocus}
          // Radix warns when there is no Description and no explicit
          // `aria-describedby`; with a description it sets the attribute itself,
          // so this spread must not exist in that case.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cx(SURFACE, SIZES[size])}
        >
          <DialogPrimitive.Title
            className={cx('text-[15px] font-semibold text-text', hideTitle && 'sr-only', closeLabel && !hideTitle && 'pe-8')}
          >
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1.5 text-sm text-text-secondary">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
          {closeLabel ? (
            <DialogPrimitive.Close asChild>
              <SNIconButton label={closeLabel} tooltipSide="bottom" className="absolute end-3 top-3">
                <CloseIcon />
              </SNIconButton>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
