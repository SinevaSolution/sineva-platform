'use client';

import * as React from 'react';
import { controlSurface } from '../../lib/control';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';

// The counter turns into a spoken announcement from 90 % of the limit. Below
// that, announcing every keystroke would drown the person typing; at the limit
// it is the information they need.
const ANNOUNCE_FROM = 0.9;

export interface SNTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Soft limit for the counter row. It is not `maxLength`: a longer paste is
   * kept and flagged, not silently cut.
   */
  max?: number;
  /** Builds the counter text, so it is translated by the caller. Required with `max`. */
  formatCounter?: (count: number, max: number) => string;
}

export const SNTextarea = React.forwardRef<HTMLTextAreaElement, SNTextareaProps>(function SNTextarea(
  { max, formatCounter, className, value, ...props },
  ref,
) {
  const a11y = useFieldControl(props);
  // Characters as people count them (code points), not UTF-16 units, so an
  // emoji counts once.
  const count = typeof value === 'string' ? [...value].length : 0;
  const showCounter = max !== undefined && formatCounter !== undefined;
  const over = showCounter && count > max;
  const announce = showCounter && count >= max * ANNOUNCE_FROM;
  const text = showCounter ? formatCounter(count, max) : '';

  const textarea = (
    <textarea
      ref={ref}
      value={value}
      {...props}
      {...a11y}
      className={cx(controlSurface, 'min-h-24 resize-y py-2.5 leading-relaxed', className)}
    />
  );
  if (!showCounter) return textarea;

  return (
    <div>
      {textarea}
      {/* Visible counter is hidden from assistive technology; the live region
          below carries the announcement, and only near the limit. */}
      <p aria-hidden="true" className={cx('mt-1 text-end text-xs', over ? 'text-danger' : 'text-text-tertiary')}>
        {text}
      </p>
      <p role="status" className="sr-only">
        {announce ? text : ''}
      </p>
    </div>
  );
});
