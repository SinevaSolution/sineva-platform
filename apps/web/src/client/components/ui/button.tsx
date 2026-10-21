import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

// App buttons: rounded-square (radius 8), brand teal is the only filled
// action color. One primary per view region.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-fg-inverse hover:bg-primary-hover',
        secondary:
          'border border-line-strong bg-surface text-fg hover:bg-hover',
        ghost: 'text-fg-secondary hover:bg-hover hover:text-fg',
      },
      size: {
        sm: 'h-7 px-2.5 text-[13px]',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-4 text-[15px]',
        icon: 'size-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
