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
        <label htmlFor={inputId} className="text-[13px] font-medium text-text">
          {label}
        </label>
        {trailing}
      </div>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        className="h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-tertiary focus:border-focus focus:shadow-(--shadow-focus-halo) aria-[invalid=true]:border-danger"
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-text-tertiary">
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
        'rounded-sm px-3 py-2 text-[13px]',
        tone === 'danger' ? 'bg-danger-surface text-danger' : 'bg-surface-tint text-text',
      )}
    >
      {children}
    </p>
  );
}
