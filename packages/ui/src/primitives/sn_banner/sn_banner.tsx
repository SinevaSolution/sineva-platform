import { X } from 'lucide-react';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { focusRing, hitArea44 } from '../../lib/focus';

export type SNBannerTone = 'info' | 'success' | 'warning' | 'danger';

// Same look as `FormAlert` in apps/web/src/client/components/ui/field.tsx,
// extended with warning and info.
const TONES: Record<SNBannerTone, string> = {
  info: 'bg-canvas-alt text-text-secondary',
  success: 'bg-surface-tint text-text',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
};

export type SNBannerProps = {
  tone?: SNBannerTone;
  title?: string;
  /** One action, usually a link-style SNButton. */
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
} & (
  | { onDismiss?: undefined; dismissLabel?: string }
  // The close button is icon-only, so a name is mandatory once it exists.
  | { onDismiss: () => void; dismissLabel: string }
);

export function SNBanner({
  tone = 'info',
  title,
  action,
  onDismiss,
  dismissLabel,
  className,
  children,
}: SNBannerProps) {
  return (
    <div
      // Danger and warning interrupt (alert); the rest wait for a pause (status).
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-sm px-3 py-2 text-[13px]', TONES[tone], className)}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className={cx(
            'relative -me-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs hover:bg-(--state-hover)',
            hitArea44,
            focusRing,
          )}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
