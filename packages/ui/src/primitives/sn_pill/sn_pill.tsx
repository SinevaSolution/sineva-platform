import * as React from 'react';
import { cx } from '../../lib/cx';

export type SNPillTone = 'positive' | 'neutral' | 'brand';

// Same classes as `Pill` in apps/web/src/client/components/ui/controls.tsx
// (rounded-full, not rounded-pill, on purpose: pixel-identical to the app).
const TONES: Record<SNPillTone, string> = {
  positive: 'bg-surface-tint text-text-brand',
  brand: 'bg-action-primary text-text-inverse',
  neutral: 'bg-canvas-alt text-text-secondary',
};

export interface SNPillProps {
  tone: SNPillTone;
  children: React.ReactNode;
  className?: string;
}

export function SNPill({ tone, children, className }: SNPillProps) {
  return (
    <span
      className={cx('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', TONES[tone], className)}
    >
      {children}
    </span>
  );
}
