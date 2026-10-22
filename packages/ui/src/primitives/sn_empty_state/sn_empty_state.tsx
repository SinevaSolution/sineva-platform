import * as React from 'react';
import { cx } from '../../lib/cx';
import { SNSinoStill, type SNSinoStillPose } from '../sn_sino_still/sn_sino_still';

const HEADINGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const;

export interface SNEmptyStateProps {
  title: string;
  /** One sentence. */
  description: string;
  pose?: SNSinoStillPose;
  /** At most one call to action. */
  action?: React.ReactNode;
  /** Heading level, so the state fits the page outline. Default 2. */
  headingLevel?: keyof typeof HEADINGS;
  className?: string;
}

export function SNEmptyState({
  title,
  description,
  pose = 'relaxed',
  action,
  headingLevel = 2,
  className,
}: SNEmptyStateProps) {
  const Heading = HEADINGS[headingLevel];
  return (
    <div className={cx('flex flex-col items-center gap-3 text-center', className)}>
      <SNSinoStill pose={pose} size={128} />
      <Heading className="text-lg font-semibold text-text">{title}</Heading>
      <p className="max-w-prose text-sm text-text-secondary">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
