'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { SNIconButton } from '../sn_icon_button/sn_icon_button';

export type SNDrawerSide = 'start' | 'end';
export type SNDrawerMobile = 'bottom' | 'side';
export type SNDrawerWidth = 'nav' | 'panel';

export interface SNDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the drawer. Visually hidden unless `showTitle`. */
  title: string;
  showTitle?: boolean;
  /** Edge a side sheet attaches to. `start` follows the writing direction. */
  side?: SNDrawerSide;
  /**
   * Below 768 px: `bottom` (default) turns the drawer into a bottom sheet,
   * `side` keeps the side sheet at every width (the app's nav drawer).
   */
  mobile?: SNDrawerMobile;
  /** `nav` is 280 px (the app nav), `panel` reads `--width-drawer` (480 px). Side sheets only. */
  width?: SNDrawerWidth;
  /**
   * Accessible name of the top-end close button. Required, so a drawer never
   * has an unnamed close control. The button is an SNIconButton, so an
   * SNTooltipProvider must be mounted above.
   */
  closeLabel: string;
  /** Tooltip text of the close button when it should be shorter than its name. */
  closeTooltip?: string;
  /** Layout only (for example `lg:hidden`); appended last on the content. */
  className?: string;
  /** Same for the scrim, which has to hide together with the content. */
  overlayClassName?: string;
  children?: React.ReactNode;
}

const MOBILE_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
// The server and the first hydration pass render the side sheet. A drawer is
// closed on first paint, so a wrong guess here never shows; the snapshot
// settles before the drawer can open.
const getServerSnapshot = () => false;

const WIDTHS: Record<SNDrawerWidth, string> = {
  nav: 'w-[280px] max-w-[85vw]',
  panel: 'w-(--width-drawer) max-w-[85vw]',
};

const EDGES: Record<SNDrawerSide, string> = {
  start: 'inset-y-0 start-0',
  end: 'inset-y-0 end-0',
};

const SURFACE = 'fixed z-(--z-drawer) bg-canvas-alt shadow-md';
const BOTTOM_SHEET = 'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-lg';

// Radix Dialog returns focus to its own `Dialog.Trigger`. These components are
// controlled and have no Trigger, so Radix would drop focus on <body>. Remember
// what had focus when the dialog opened and give it back on close. A layout
// effect, because Radix moves focus into the content in a passive effect that
// runs later in the same open. Gotcha: if the opener unmounted meanwhile (a
// menu item), nothing is restored; pass `onCloseAutoFocus` and place focus.
function useRestoreFocus(open: boolean) {
  const openerRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return (event: Event) => {
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

/**
 * Built on Radix Dialog, not vaul, on purpose: the app shell's nav sheet has
 * to keep exactly the focus trap, scroll lock and focus return it has today,
 * and vaul's drag gesture would change how touches and focus behave inside it.
 * The cost is that the bottom sheet cannot be dragged shut; it closes with the
 * close button, Escape or a press on the scrim.
 */
export function SNDrawer({
  open,
  onOpenChange,
  title,
  showTitle = false,
  side = 'start',
  mobile = 'bottom',
  width = 'nav',
  closeLabel,
  closeTooltip,
  className,
  overlayClassName,
  children,
}: SNDrawerProps) {
  const isNarrow = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const asBottomSheet = mobile === 'bottom' && isNarrow;
  const handleCloseAutoFocus = useRestoreFocus(open);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cx('fixed inset-0 z-(--z-drawer) bg-scrim', overlayClassName)} />
        <DialogPrimitive.Content
          onCloseAutoFocus={handleCloseAutoFocus}
          // No description slot: an explicit undefined stops Radix warning about it.
          aria-describedby={undefined}
          className={cx(SURFACE, asBottomSheet ? BOTTOM_SHEET : [EDGES[side], WIDTHS[width]].join(' '), className)}
        >
          <DialogPrimitive.Title className={cx(showTitle ? 'px-4 pe-12 pt-4 text-[15px] font-semibold text-text' : 'sr-only')}>
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <SNIconButton label={closeLabel} tooltip={closeTooltip} tooltipSide="bottom" className="absolute end-2 top-3">
              <CloseIcon />
            </SNIconButton>
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
