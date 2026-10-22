import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { focusRing } from '../../lib/focus';

export type SNCardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<SNCardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const BASE = 'rounded-lg border border-border bg-surface';

// The "D archetype": a whole card that acts as one control. Hover tints the
// surface (same state token as buttons) and the focus ring is the shared one.
// Non-interactive cards get none of this so a static panel never looks clickable.
const INTERACTIVE =
  'cursor-pointer transition-colors duration-150 ease-out hover:bg-(--state-hover)';

export interface SNCardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: SNCardPadding;
  /** Adds a resting shadow. */
  elevated?: boolean;
  /** Pointer, hover state and focus ring. Pair with `asChild` or an `onClick`. */
  interactive?: boolean;
  /** Render through the child element (a link or button) instead of a `div`. */
  asChild?: boolean;
}

export const SNCard = React.forwardRef<HTMLDivElement, SNCardProps>(function SNCard(
  { padding = 'md', elevated = false, interactive = false, asChild = false, className, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      ref={ref}
      className={cx(
        BASE,
        PADDING[padding],
        elevated && 'shadow-sm',
        interactive && INTERACTIVE,
        interactive && focusRing,
        className,
      )}
      {...props}
    />
  );
});
