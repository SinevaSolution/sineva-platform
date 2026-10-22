'use client';

import * as React from 'react';
import { cn } from '@/client/components/ui/cn';

// Shared look of the small toggle chips on the Library page (status filter,
// specialist toggles). A chip is a toggle button (`aria-pressed`), not a link:
// it changes what is shown or chosen, it does not go anywhere. The visible
// height is 36 px; the pointer and touch target is 44 px through the
// pseudo-element, as for every small control in the app.
export const CHIP_BASE =
  "relative inline-flex h-9 cursor-pointer items-center rounded-full border px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60";

export function LibraryChip({
  pressed,
  onClick,
  children,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        CHIP_BASE,
        'gap-1.5',
        pressed
          ? 'border-transparent bg-action-primary text-text-inverse'
          : 'border-border-strong bg-surface text-text-secondary hover:bg-(--state-hover) hover:text-text',
        className,
      )}
    >
      {children}
    </button>
  );
}
