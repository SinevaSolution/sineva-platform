'use client';

import { Check, Minus } from 'lucide-react';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';
import { focusRing } from '../../lib/focus';

export interface SNCheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange' | 'size'> {
  label: React.ReactNode;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Mixed state (a parent of partly selected children). Shown as a dash. */
  indeterminate?: boolean;
}

/**
 * A native checkbox drawn with tokens. Native on purpose: it brings keyboard,
 * form participation and screen reader semantics with no code, and the label
 * wraps the whole row so the touch target is the row (min 44 px), not the 20 px box.
 */
export const SNCheckbox = React.forwardRef<HTMLInputElement, SNCheckboxProps>(function SNCheckbox(
  { label, description, checked, onCheckedChange, indeterminate = false, disabled, className, ...props },
  ref,
) {
  const a11y = useFieldControl(props);
  const inner = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  React.useEffect(() => {
    // `indeterminate` is a DOM property with no HTML attribute.
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const descriptionId = React.useId();
  const describedBy = [a11y['aria-describedby'], description ? descriptionId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <label
      className={cx(
        'flex min-h-11 items-start gap-3 py-2.5',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        className,
      )}
    >
      <span className="relative mt-px inline-flex size-5 shrink-0">
        <input
          ref={inner}
          type="checkbox"
          {...props}
          {...a11y}
          aria-describedby={describedBy}
          aria-checked={indeterminate ? 'mixed' : undefined}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className={cx(
            'peer size-5 cursor-[inherit] appearance-none rounded-xs border border-border-input bg-surface transition-colors checked:border-action-primary checked:bg-action-primary indeterminate:border-action-primary indeterminate:bg-action-primary aria-[invalid=true]:border-danger',
            focusRing,
          )}
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-3.5 text-text-inverse opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
        />
        <Minus
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-3.5 text-text-inverse opacity-0 peer-indeterminate:opacity-100"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] text-text">{label}</span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-[13px] text-text-tertiary">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});
