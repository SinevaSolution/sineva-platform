'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

/**
 * One tooltip for every icon or ambiguous button, so people can learn what a
 * control does before pressing it. Wrap the trigger; the child must accept a
 * ref (buttons, links). `shortcut` renders as a key hint after the label.
 * Needs the TooltipProvider in AppProviders.
 */
export function Tooltip({
  label,
  shortcut,
  side = 'top',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="anim-swap z-(--z-tooltip) flex items-center gap-2 rounded-xs bg-surface-inverse px-2 py-1 text-xs font-medium text-text-inverse shadow-md [--d:0ms]"
        >
          {label}
          {shortcut ? (
            <kbd className="rounded-xs bg-text-inverse/15 px-1 font-sans text-[11px] text-text-inverse/80">{shortcut}</kbd>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
