import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { SNSinoStill, type SNSinoStillPose } from '../sn_sino_still/sn_sino_still';

const HEADINGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const;

type Size = 'sm' | 'md' | 'lg';

// Sizes: `sm` sits inside a list, sidebar section or drawer; `md` fills a
// panel; `lg` owns a whole page. The art scales with it.
const SINO_PX: Record<Size, number> = { sm: 72, md: 128, lg: 168 };
const ICON_BOX: Record<Size, string> = { sm: 'size-10', md: 'size-14', lg: 'size-16' };
const ICON_GLYPH: Record<Size, string> = { sm: 'size-5', md: 'size-6', lg: 'size-7' };
const TITLE: Record<Size, string> = { sm: 'text-sm', md: 'text-lg', lg: 'text-xl' };
const GAP: Record<Size, string> = { sm: 'gap-2', md: 'gap-3', lg: 'gap-4' };

export interface SNEmptyStateProps {
  title: string;
  /** One sentence. */
  description: string;
  /**
   * An icon for compact places (lists, sidebar, drawers). When given it
   * replaces the Sino illustration; leave it out for full pages.
   */
  icon?: LucideIcon;
  pose?: SNSinoStillPose;
  size?: Size;
  /** At most one call to action. */
  action?: React.ReactNode;
  /** Heading level, so the state fits the page outline. Default 2. */
  headingLevel?: keyof typeof HEADINGS;
  className?: string;
}

/**
 * What a place shows when it has nothing yet: art, a title that says what is
 * missing, one sentence on what to do, and at most one action. A status
 * region, so screen readers hear it when a list empties.
 */
export function SNEmptyState({
  title,
  description,
  icon: Icon,
  pose = 'relaxed',
  size = 'md',
  action,
  headingLevel = 2,
  className,
}: SNEmptyStateProps) {
  const Heading = HEADINGS[headingLevel];
  return (
    <div
      role="status"
      data-size={size}
      className={cx('flex flex-col items-center text-center', GAP[size], className)}
    >
      {Icon ? (
        <span
          data-slot="empty-icon"
          className={cx(
            'flex items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-focus)_12%,transparent)] text-text-brand ring-1 ring-[color-mix(in_oklab,var(--color-focus)_18%,transparent)]',
            ICON_BOX[size],
          )}
        >
          <Icon aria-hidden="true" className={ICON_GLYPH[size]} strokeWidth={1.75} />
        </span>
      ) : (
        <SNSinoStill pose={pose} size={SINO_PX[size]} />
      )}
      <Heading className={cx('font-semibold text-text', TITLE[size])}>{title}</Heading>
      <p className={cx('max-w-prose text-text-secondary', size === 'sm' ? 'text-xs' : 'text-sm')}>
        {description}
      </p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
