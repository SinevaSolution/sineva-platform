'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cx } from '../../lib/cx';

export type SNPopoverSide = 'top' | 'right' | 'bottom' | 'left';
export type SNPopoverAlign = 'start' | 'center' | 'end';

export interface SNPopoverContentProps {
  side?: SNPopoverSide;
  align?: SNPopoverAlign;
  /** Distance from the trigger in px. */
  sideOffset?: number;
  /** Keeps the panel this far from the viewport edge, in px. */
  collisionPadding?: number;
  /** Layout only (width, max-height); the surface is fixed. */
  className?: string;
  /**
   * Runs when the panel closes, before focus goes back to the trigger. Call
   * `event.preventDefault()` to keep focus elsewhere (a field the panel just
   * made appear, for instance).
   */
  onCloseAutoFocus?: (event: Event) => void;
  children?: React.ReactNode;
}

/** Click-to-open panel for free-form content (a form, a picker). Closes on Escape and outside press. */
export const SNPopover = PopoverPrimitive.Root;

/** Pass `asChild` to make your own button the trigger; it gets `aria-expanded`. */
export const SNPopoverTrigger = PopoverPrimitive.Trigger;

// Same surface as the dropdown menu so a popover and a menu look like one family.
// anim-swap is a global keyframe class (see sn_tooltip).
const SURFACE =
  'anim-swap z-(--z-dropdown) rounded-md border border-border bg-surface p-1 text-text shadow-md outline-none';

export const SNPopoverContent = React.forwardRef<HTMLDivElement, SNPopoverContentProps>(function SNPopoverContent(
  { side, align, sideOffset = 6, collisionPadding = 8, className, onCloseAutoFocus, children },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cx(SURFACE, className)}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});
