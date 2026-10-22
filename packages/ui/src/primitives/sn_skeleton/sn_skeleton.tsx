import * as React from 'react';
import { cx } from '../../lib/cx';

export type SNSkeletonVariant = 'text' | 'circle' | 'rect';

// `motion-safe:animate-pulse` rather than `animate-pulse motion-reduce:animate-none`:
// a single class with no reliance on stylesheet order, and the default under
// reduced motion is a still block. No custom keyframes, so no global CSS.
const BASE = 'block shrink-0 bg-canvas-alt motion-safe:animate-pulse';

// Default boxes; widths are layout, so a caller sets them with `className`.
const VARIANTS: Record<SNSkeletonVariant, string> = {
  text: 'h-3 w-full rounded-xs',
  circle: 'size-10 rounded-full',
  rect: 'h-16 w-full rounded-sm',
};

export interface SNSkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: SNSkeletonVariant;
}

export function SNSkeleton({ variant = 'rect', className, ...props }: SNSkeletonProps) {
  return <span aria-hidden="true" className={cx(BASE, VARIANTS[variant], className)} {...props} />;
}
