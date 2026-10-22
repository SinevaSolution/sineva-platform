'use client';

import * as React from 'react';
import { cx } from '../../lib/cx';
import { focusRing, hitArea44 } from '../../lib/focus';
import { SNTooltip } from '../sn_tooltip/sn_tooltip';

export type SNIconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type SNIconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<SNIconButtonVariant, string> = {
  primary: 'bg-action-primary text-text-inverse hover:bg-action-primary-hover',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-(--state-hover)',
  ghost: 'text-text-secondary hover:bg-(--state-hover) hover:text-text',
  danger: 'text-danger hover:bg-danger-surface',
};

// xs 24, sm 28 and md 36 reach 44 px through the hit-area pseudo-element; lg is
// 44. The radius is part of the entry (not a separate class) so a size never
// carries two conflicting radius utilities: there is no tailwind-merge to settle it.
const SIZES: Record<SNIconButtonSize, string> = {
  xs: `relative size-6 rounded-xs ${hitArea44}`,
  sm: `relative size-7 rounded-sm ${hitArea44}`,
  md: `relative size-9 rounded-sm ${hitArea44}`,
  lg: 'size-11 rounded-sm',
};

export interface SNIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> {
  /** Accessible name and, unless `tooltip` is set, tooltip text. Required: an icon alone names nothing. */
  label: string;
  /**
   * Tooltip text when it should be shorter than the name: a menu button named
   * "Options for Quarterly plan" shows "Options". The name stays `label`.
   */
  tooltip?: string;
  variant?: SNIconButtonVariant;
  size?: SNIconButtonSize;
  /** Makes it a toggle button (`aria-pressed`). */
  pressed?: boolean;
  shortcut?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Icon-only button. The label is both the accessible name and a tooltip, so
 * there is no way to build one without either. Needs an SNTooltipProvider above.
 */
export const SNIconButton = React.forwardRef<HTMLButtonElement, SNIconButtonProps>(function SNIconButton(
  { label, tooltip, variant = 'ghost', size = 'md', pressed, shortcut, tooltipSide = 'top', type, className, children, ...props },
  ref,
) {
  return (
    <SNTooltip label={tooltip ?? label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-label={label}
        aria-pressed={pressed}
        className={cx(
          'inline-flex shrink-0 cursor-pointer select-none items-center justify-center transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
          focusRing,
          VARIANTS[variant],
          SIZES[size],
          pressed && 'bg-(--state-hover) text-text',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </SNTooltip>
  );
});
