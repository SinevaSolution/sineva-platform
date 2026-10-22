'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as React from 'react';
import { cx } from '../../lib/cx';

export type SNAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// `sm` is the 28 px avatar of the sidebar user menu, text included.
const SIZES: Record<SNAvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-[13px]',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
};

/**
 * First letter of the first two words, uppercased; the first letter of the
 * email when the name is blank; an empty string when there is neither.
 * `Array.from` keeps a surrogate pair (an emoji or rare CJK letter) whole.
 */
export function snAvatarInitials(name: string, email?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return Array.from(email?.trim() ?? '')[0]?.toUpperCase() ?? '';
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase();
}

export interface SNAvatarProps {
  src?: string;
  /** Alt text and the source of the initials. */
  name: string;
  email?: string;
  size?: SNAvatarSize;
  /** Use when the name is printed next to the avatar: hides it from assistive tech. */
  decorative?: boolean;
  className?: string;
}

export function SNAvatar({ src, name, email, size = 'md', decorative = false, className }: SNAvatarProps) {
  return (
    <AvatarPrimitive.Root
      aria-hidden={decorative || undefined}
      className={cx('relative inline-flex shrink-0 overflow-hidden rounded-full', SIZES[size], className)}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt={decorative ? '' : name}
          className="size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        // role=img + aria-label so the fallback is announced as the person, not
        // as two stray letters. Skipped when decorative (the root is hidden).
        role={decorative ? undefined : 'img'}
        aria-label={decorative || !name ? undefined : name}
        className="flex size-full items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-focus)_22%,var(--color-surface))] font-semibold text-text-brand"
      >
        {snAvatarInitials(name, email)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
