import { CircleX, Eye, LoaderCircle, Pause } from 'lucide-react';
import * as React from 'react';
import { cx } from '../../lib/cx';

export type SNBadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'review'
  | 'running'
  | 'paused'
  | 'failed';

const TONES: Record<SNBadgeTone, string> = {
  neutral: 'bg-canvas-alt text-text-secondary',
  brand: 'bg-surface-tint text-text-brand',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
  review: 'bg-warning-surface text-warning',
  running: 'bg-surface-tint text-text-brand',
  paused: 'bg-canvas-alt text-text-secondary',
  failed: 'bg-danger-surface text-danger',
};

// A status is never colour only: review and warning share a palette, so the
// icon (and the text) carry the difference. `running` spins, but not under
// reduced motion.
const STATUS_ICONS: Partial<Record<SNBadgeTone, React.ReactNode>> = {
  review: <Eye aria-hidden="true" />,
  running: <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />,
  paused: <Pause aria-hidden="true" />,
  failed: <CircleX aria-hidden="true" />,
};

export interface SNBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: SNBadgeTone;
  /** Replaces the default icon of a status tone. Decorative: it is hidden from assistive tech. */
  icon?: React.ReactNode;
}

export function SNBadge({ tone = 'neutral', icon, className, children, ...props }: SNBadgeProps) {
  const isStatus = tone in STATUS_ICONS;
  // An override on a plain tone is allowed too; a status tone always has an icon.
  const glyph = icon ?? STATUS_ICONS[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {isStatus || icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-3">
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}
