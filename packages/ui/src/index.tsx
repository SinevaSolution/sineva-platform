import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-primary)] disabled:pointer-events-none disabled:opacity-50 min-h-[44px] px-4 py-2.5 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--color-action-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-action-primary-hover)] shadow-sm',
        secondary:
          'bg-[var(--color-surface-elevated)] text-[var(--color-text)] border border-[var(--color-border-strong)] hover:border-[var(--color-action-primary)] hover:text-[var(--color-action-primary)]',
        ghost:
          'bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]',
        sun: 'bg-[var(--sun-100)] text-[var(--ink-950)] border border-[var(--sun-500)]/40 hover:bg-[var(--sun-500)]/20',
      },
      size: {
        sm: 'min-h-[38px] px-3 py-1.5 text-xs rounded-lg',
        md: 'min-h-[44px] px-4 py-2.5 text-sm rounded-xl',
        lg: 'min-h-[48px] px-6 py-3 text-base rounded-xl',
        icon: 'min-h-[44px] min-w-[44px] p-2.5 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        elevated && 'bg-[var(--color-surface-elevated)] shadow-md',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide border transition-colors',
  {
    variants: {
      tone: {
        teal: 'bg-[var(--teal-50)] text-[var(--teal-800)] border-[var(--teal-200)] dark:bg-[var(--teal-900)]/50 dark:text-[var(--teal-100)] dark:border-[var(--teal-700)]',
        sun: 'bg-[var(--sun-100)] text-[var(--ink-900)] border-[var(--sun-500)]/40',
        neutral:
          'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]',
        success:
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
        warning:
          'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
      },
    },
    defaultVariants: {
      tone: 'teal',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'default' | 'wide' | 'narrow';
}

export function Container({
  className,
  size = 'default',
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        size === 'narrow' && 'max-w-4xl',
        size === 'default' && 'max-w-7xl',
        size === 'wide' && 'max-w-[1440px]',
        className,
      )}
      {...props}
    />
  );
}

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: 'online' | 'degraded' | 'offline' | 'standby';
  label: string;
}

export function StatusPill({
  status,
  label,
  className,
  ...props
}: StatusPillProps) {
  const dotColors: Record<StatusPillProps['status'], string> = {
    online: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    offline: 'bg-rose-500',
    standby: 'bg-[var(--teal-500)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1 text-xs font-medium text-[var(--color-text)]',
        className,
      )}
      {...props}
    >
      <span
        className={cn('h-2 w-2 rounded-full', dotColors[status])}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
