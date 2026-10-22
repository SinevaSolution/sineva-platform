'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

export interface SNTooltipProps {
  label: string;
  /** Rendered as a key hint after the label. */
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** The trigger. It must accept a ref (buttons, links). */
  children: React.ReactElement;
}

/**
 * One tooltip for every icon or ambiguous button, so people can learn what a
 * control does before pressing it. Shows on hover and keyboard focus, closes on
 * Escape, and stays open while the pointer is over it (WCAG 1.4.13). Needs an
 * SNTooltipProvider above it; Radix throws without one.
 */
export function SNTooltip({ label, shortcut, side = 'top', children }: SNTooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          // anim-swap is a global keyframe class; --d:0ms removes its stagger delay.
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

export const SNTooltipProvider = TooltipPrimitive.Provider;
