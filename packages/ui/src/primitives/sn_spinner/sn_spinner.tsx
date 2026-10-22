import { cx } from '../../lib/cx';

export type SNSpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<SNSpinnerSize, string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-6',
};

export interface SNSpinnerProps {
  size?: SNSpinnerSize;
  /**
   * Accessible name. Without it the spinner is decorative (a button that
   * shows it already says "busy"); with it, it is a `status` region.
   */
  label?: string;
  className?: string;
}

export function SNSpinner({ size = 'md', label, className }: SNSpinnerProps) {
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cx('shrink-0 animate-spin motion-reduce:animate-none', SIZES[size], className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (!label) return svg;
  return (
    // role=status takes its name from the author, not from content, so the
    // label is an aria-label rather than hidden text.
    <span role="status" aria-label={label} className="inline-flex">
      {svg}
    </span>
  );
}
