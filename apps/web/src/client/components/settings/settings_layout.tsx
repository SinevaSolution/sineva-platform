import * as React from 'react';
import { cn } from '@/client/components/ui/cn';

/**
 * A quiet group of rows under a small title. No box around the group: the
 * hairlines between rows carry the structure, which keeps long forms light.
 */
export function SettingsSection({
  title,
  children,
  delay = 0,
}: {
  title: string;
  children: React.ReactNode;
  /** Stagger of the entrance, in ms. */
  delay?: number;
}) {
  return (
    <section className="anim-rise" style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      <h2 className="pb-2 text-[13px] font-semibold text-text">{title}</h2>
      <div className="divide-y divide-border border-y border-border">{children}</div>
    </section>
  );
}

/**
 * One setting: label and one-line helper on the left, the control on the
 * right. Stacks below 640 px. `inline` puts a switch next to its label at every
 * width, since a switch is small and reads best beside its text.
 */
export function SettingsRow({
  label,
  helper,
  htmlFor,
  error,
  inline = false,
  children,
}: {
  label: string;
  helper?: string;
  htmlFor?: string;
  error?: string | null;
  inline?: boolean;
  children: React.ReactNode;
}) {
  const helperId = htmlFor && helper ? `${htmlFor}-helper` : undefined;
  return (
    <div
      className={cn(
        'gap-x-8 gap-y-2 py-4',
        inline ? 'flex items-center justify-between' : 'grid sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)] sm:items-start',
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[14px] font-medium text-text">
            {label}
          </label>
        ) : (
          <div className="text-[14px] font-medium text-text">{label}</div>
        )}
        {helper ? (
          <p id={helperId} className="mt-0.5 text-[13px] leading-snug text-text-tertiary">
            {helper}
          </p>
        ) : null}
      </div>
      <div className={cn('min-w-0', inline && 'shrink-0')}>
        {children}
        {error ? (
          <p role="alert" className="mt-1.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
