import * as React from 'react';
import { cx } from '../../lib/cx';
import { FieldContext, type FieldState } from '../../lib/field_context';

export interface SNFieldProps {
  label: string;
  /** One line under the control. Hidden while an error shows. */
  hint?: string;
  /** Error text. Sets `aria-invalid` on the control and replaces the hint. */
  error?: string | null;
  /** Sits at the end of the label row (a "Forgot password?" link). */
  trailing?: React.ReactNode;
  required?: boolean;
  /** Id for the control; generated when omitted. An explicit id on the control wins. */
  id?: string;
  className?: string;
  /** One control (SNInput, SNTextarea, SNSelect, SNCombobox, SNCheckbox ...). */
  children: React.ReactNode;
}

/**
 * Label, control, helper and error wired together: the label points at the
 * control, the control is described by whichever of error or helper shows, and
 * `aria-invalid` is only set while there is an error. The control reads the
 * wiring from context, so no ids are passed by hand.
 */
export function SNField({ label, hint, error, trailing, required, id, className, children }: SNFieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? generatedId;
  const hintId = hint && !error ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  const state = React.useMemo<FieldState>(
    () => ({
      id: controlId,
      describedBy: errorId ?? hintId,
      invalid: Boolean(error),
      required: Boolean(required),
    }),
    [controlId, errorId, hintId, error, required],
  );

  return (
    <FieldContext.Provider value={state}>
      <div className={cx('space-y-1.5', className)}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={controlId} className="text-[13px] font-medium text-text">
            {label}
          </label>
          {trailing}
        </div>
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-[13px] text-text-tertiary">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
