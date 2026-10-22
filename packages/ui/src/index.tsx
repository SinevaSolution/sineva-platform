import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-200 ease-out-expo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 min-h-[44px] px-4 py-2.5 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-action-primary text-text-inverse hover:bg-action-primary-hover shadow-sm',
        secondary:
          'bg-surface text-text border border-border-strong shadow-sm hover:border-action-primary hover:text-action-primary',
        ghost:
          'bg-transparent text-text-secondary hover:bg-canvas-alt hover:text-text',
        sun: 'bg-warning-surface text-text border border-warning/40 hover:bg-warning/20',
      },
      size: {
        sm: 'min-h-[38px] px-3 py-1.5 text-xs rounded-sm',
        md: 'min-h-[44px] px-4 py-2.5 text-sm rounded-md',
        lg: 'min-h-[48px] px-6 py-3 text-base rounded-md',
        icon: 'min-h-[44px] min-w-[44px] p-2.5 rounded-md',
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
        'rounded-lg border border-border bg-surface p-6 transition-all duration-200 ease-out-expo',
        elevated && 'shadow-md',
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
        teal: 'bg-surface-tint text-text-brand border-border-strong',
        sun: 'bg-warning-surface text-text border-warning/40',
        neutral:
          'bg-canvas-alt text-text-secondary border-border',
        success:
          'bg-success-surface text-success border-success/25',
        warning:
          'bg-warning-surface text-warning border-warning/25',
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
    online: 'bg-success',
    degraded: 'bg-warning',
    offline: 'bg-danger',
    standby: 'bg-focus',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text shadow-sm',
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
