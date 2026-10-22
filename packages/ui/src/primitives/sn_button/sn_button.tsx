import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { focusRing, hitArea44 } from '../../lib/focus';
import { SNSpinner } from '../sn_spinner/sn_spinner';

export type SNButtonVariant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger' | 'link';
export type SNButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type SNButtonShape = 'square' | 'pill';

// Static maps, not cva plus tailwind-merge: a conflict is solved by picking
// the right entry, never by class order (see lib/cx.ts).
const VARIANTS: Record<SNButtonVariant, string> = {
  primary: 'bg-action-primary text-text-inverse hover:bg-action-primary-hover',
  dark: 'bg-action-dark text-text-inverse hover:bg-action-dark/90',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-(--state-hover)',
  ghost: 'text-text-secondary hover:bg-(--state-hover) hover:text-text',
  danger: 'bg-danger text-text-on-danger hover:bg-danger/90',
  link: 'text-text-brand underline-offset-4 hover:underline',
};

// Visible heights: xs 28 and sm 36 stay compact but reach 44 px through the
// hit-area pseudo-element; md is 40 and grows to 44 on coarse pointers; lg is 44.
const SIZES: Record<SNButtonSize, string> = {
  xs: `relative h-7 px-2.5 text-[13px] ${hitArea44}`,
  sm: `relative h-9 px-3.5 text-sm ${hitArea44}`,
  md: 'h-10 px-4 text-sm pointer-coarse:h-11',
  lg: 'h-11 px-4 text-[15px]',
};

// A link-style button is inline text: no fixed height, so it sits in a sentence.
const LINK_SIZE = 'text-sm';

const SHAPES: Record<SNButtonShape, string> = {
  square: 'rounded-sm',
  pill: 'rounded-pill',
};

const BASE =
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

export interface SNButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SNButtonVariant;
  size?: SNButtonSize;
  shape?: SNButtonShape;
  /** Keeps the label, shows a spinner, sets `aria-busy` and ignores clicks. */
  loading?: boolean;
  /** Render through the child element (a router link) instead of a `button`. */
  asChild?: boolean;
}

export const SNButton = React.forwardRef<HTMLButtonElement, SNButtonProps>(function SNButton(
  {
    variant = 'secondary',
    size = 'md',
    shape = 'square',
    loading = false,
    asChild = false,
    type,
    className,
    children,
    onClick,
    ...props
  },
  ref,
) {
  const classes = cx(
    BASE,
    focusRing,
    VARIANTS[variant],
    variant === 'link' ? LINK_SIZE : SIZES[size],
    variant === 'link' ? 'rounded-xs' : SHAPES[shape],
    className,
  );

  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      aria-busy={loading || undefined}
      // aria-disabled, not `disabled`: a busy button keeps its focus so a
      // screen reader user is not thrown to the page when they press it.
      aria-disabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      {...props}
    >
      {loading ? <SNSpinner size="sm" /> : null}
      {children}
    </button>
  );
});
