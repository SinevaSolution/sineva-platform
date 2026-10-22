'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from './cn';

// Bare form controls for settings rows, where the label and helper sit in the
// row and not above the input (so `Field` does not fit). They share Field's
// input look: 44 px tall, hairline border, teal focus ring.
export const controlClass =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-tertiary focus:border-[var(--color-focus)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_18%,transparent)] aria-[invalid=true]:border-danger read-only:cursor-default read-only:bg-surface-alt read-only:text-fg-secondary';

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, 'h-11', className)} {...props} />;
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-24 resize-y py-2.5 leading-relaxed', className)} {...props} />;
}

export function SelectInput({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, 'h-11', className)} {...props}>
      {children}
    </select>
  );
}

/**
 * On/off switch. The 44 px hit area is the pseudo element, so the track can
 * stay 24 px tall and still meet the touch-target rule.
 */
export function Switch({
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'children'>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-[var(--color-border-strong)] transition-colors duration-150 before:absolute before:-inset-2 before:content-[""] data-[state=checked]:bg-primary disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-[var(--color-text-inverse)] shadow-sm transition-transform duration-150 ease-[var(--ease-out-quint)] data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

export function Pill({
  tone,
  children,
  className,
}: {
  tone: 'positive' | 'neutral' | 'brand';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
        tone === 'positive' && 'bg-surface-tint text-fg-brand',
        tone === 'brand' && 'bg-primary text-fg-inverse',
        tone === 'neutral' && 'bg-surface-alt text-fg-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}
