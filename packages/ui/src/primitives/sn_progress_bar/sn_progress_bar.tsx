import { cx } from '../../lib/cx';

export interface SNProgressBarProps {
  /** Accessible name: a bare bar tells a screen reader nothing. */
  label: string;
  /** Omit for an indeterminate bar (no `aria-valuenow`). Clamped to 0..max. */
  value?: number;
  max?: number;
  className?: string;
}

export function SNProgressBar({ label, value, max = 100, className }: SNProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const determinate = value !== undefined;
  const clamped = determinate ? Math.min(safeMax, Math.max(0, value)) : undefined;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      className={cx('h-1.5 w-full overflow-hidden rounded-pill bg-canvas-alt', className)}
    >
      <div
        className={cx(
          'h-full rounded-pill bg-action-primary',
          clamped === undefined
            ? // Indeterminate: a short fixed segment that pulses. Under reduced
              // motion it is a still segment, not a bar that looks full.
              'w-2/5 motion-safe:animate-pulse'
            : 'transition-[width] duration-300 ease-out motion-reduce:transition-none',
        )}
        style={clamped === undefined ? undefined : { width: `${(clamped / safeMax) * 100}%` }}
      />
    </div>
  );
}
