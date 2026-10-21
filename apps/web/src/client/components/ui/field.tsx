import * as React from 'react';
import { cn } from './cn';

/** Labelled input with optional hint and error, wired for screen readers. */
export function Field({
  label,
  hint,
  error,
  trailing,
  className,
  id,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  trailing?: React.ReactNode;
}) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {trailing}
      </div>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-tertiary focus:border-[var(--color-focus)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_18%,transparent)] aria-[invalid=true]:border-danger"
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-fg-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success';
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-3 py-2 text-[13px]',
        tone === 'danger' ? 'bg-danger-surface text-danger' : 'bg-surface-tint text-fg',
      )}
    >
      {children}
    </p>
  );
}
