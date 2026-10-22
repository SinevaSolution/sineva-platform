import * as React from 'react';
import { cx } from '../../lib/cx';

export type SNStatusChipTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const DOTS: Record<SNStatusChipTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-tertiary',
  info: 'bg-text-brand',
};

export interface SNStatusChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone: SNStatusChipTone;
  /** Required: the text names the state, the dot only decorates it. */
  label: string;
}

export function SNStatusChip({ tone, label, className, ...props }: SNStatusChipProps) {
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary', className)}
      {...props}
    >
      <span aria-hidden="true" className={cx('size-1.5 shrink-0 rounded-full', DOTS[tone])} />
      {label}
    </span>
  );
}
