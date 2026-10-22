'use client';

import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cx } from '../../lib/cx';

/** Root: owns the open state. Controlled with `open` and `onOpenChange`, or uncontrolled. */
export const SNDropdownMenu = MenuPrimitive.Root;

export type SNDropdownMenuTriggerProps = React.ComponentPropsWithoutRef<typeof MenuPrimitive.Trigger>;

/**
 * Pass `asChild` to use your own button. The trigger gets `aria-haspopup`,
 * `aria-expanded` and `data-state`, so style the open state with
 * `data-[state=open]:`. Radix opens on pointer down, Enter, Space and ArrowDown.
 */
export const SNDropdownMenuTrigger = React.forwardRef<HTMLButtonElement, SNDropdownMenuTriggerProps>(
  function SNDropdownMenuTrigger({ className, ...props }, ref) {
    return <MenuPrimitive.Trigger ref={ref} className={className} {...props} />;
  },
);

export type SNDropdownMenuSide = 'top' | 'right' | 'bottom' | 'left';
export type SNDropdownMenuAlign = 'start' | 'center' | 'end';

export interface SNDropdownMenuContentProps {
  side?: SNDropdownMenuSide;
  align?: SNDropdownMenuAlign;
  sideOffset?: number;
  collisionPadding?: number;
  /** The entrance animation. Off only to match a menu that never had it. */
  anim?: boolean;
  /**
   * Layout only: pass the width here (`w-40`, `w-60`). It is appended last.
   */
  className?: string;
  /**
   * Runs when the menu closes, before focus returns to the trigger.
   * `event.preventDefault()` keeps focus where it is, which a Rename or Delete
   * item needs when it moves focus into a field or dialog it just opened.
   */
  onCloseAutoFocus?: (event: Event) => void;
  children?: React.ReactNode;
}

// anim-swap is a global keyframe class (see sn_tooltip).
const SURFACE = 'z-(--z-popover) rounded-md border border-border bg-surface p-1 shadow-md';

export const SNDropdownMenuContent = React.forwardRef<HTMLDivElement, SNDropdownMenuContentProps>(
  function SNDropdownMenuContent(
    { side, align, sideOffset = 6, collisionPadding = 8, anim = true, className, onCloseAutoFocus, children },
    ref,
  ) {
    return (
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          ref={ref}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cx(anim && 'anim-swap', SURFACE, className)}
        >
          {children}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    );
  },
);

const ITEM_BASE =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 text-[13px] outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-(--state-hover) [&_svg]:size-4 [&_svg]:shrink-0';

// Two entries instead of appending `text-danger` to `text-text`: without
// tailwind-merge both color utilities would stay on the element and the
// stylesheet order, not intent, would pick the winner.
const ITEM_COLOR = { default: 'text-text', destructive: 'text-danger' } as const;

export interface SNDropdownMenuItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>, 'className'> {
  /** Danger color for Delete or Sign out. */
  destructive?: boolean;
  /** Render through the child (a router link) instead of a div. */
  asChild?: boolean;
  className?: string;
}

export const SNDropdownMenuItem = React.forwardRef<HTMLDivElement, SNDropdownMenuItemProps>(
  function SNDropdownMenuItem({ destructive = false, className, ...props }, ref) {
    return <MenuPrimitive.Item ref={ref} className={cx(ITEM_BASE, ITEM_COLOR[destructive ? 'destructive' : 'default'], className)} {...props} />;
  },
);

export function SNDropdownMenuSeparator({ className }: { className?: string }) {
  return <MenuPrimitive.Separator className={cx('my-1 h-px bg-border', className)} />;
}

export function SNDropdownMenuLabel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <MenuPrimitive.Label className={cx('px-2 pb-1 pt-2 text-[11px] font-medium text-text-tertiary', className)}>
      {children}
    </MenuPrimitive.Label>
  );
}
