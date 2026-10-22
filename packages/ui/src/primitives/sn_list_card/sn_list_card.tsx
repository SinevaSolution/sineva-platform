'use client';

import * as React from 'react';
import { cx } from '../../lib/cx';
import { SNCard } from '../sn_card/sn_card';

export interface SNListCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Also the accessible name when the card is interactive. */
  title: string;
  description?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /**
   * Make the single child element (a router link) the card. The card content
   * replaces the child's own children, so pass it empty: `<a href="/x" />`.
   */
  asChild?: boolean;
}

export function SNListCard({
  title,
  description,
  leading,
  trailing,
  asChild = false,
  onClick,
  className,
  children,
  ...props
}: SNListCardProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const interactive = asChild || onClick !== undefined;

  const content = (
    <>
      {leading ? <span className="inline-flex shrink-0 items-center">{leading}</span> : null}
      <span className="block min-w-0 flex-1">
        <span id={titleId} className="block truncate text-sm font-medium text-text">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="block text-[13px] text-text-secondary">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? <span className="inline-flex shrink-0 items-center">{trailing}</span> : null}
    </>
  );

  let element: React.ReactElement;
  if (asChild) {
    // cloneElement rather than Slottable: the card builds the content itself,
    // so the caller's element only contributes its tag and attributes.
    element = React.cloneElement(React.Children.only(children) as React.ReactElement, undefined, content);
  } else if (onClick) {
    element = (
      <button type="button" onClick={onClick}>
        {content}
      </button>
    );
  } else {
    element = <div>{content}</div>;
  }

  return (
    <SNCard
      asChild
      interactive={interactive}
      className={cx('flex items-center gap-3', interactive && 'text-start', className)}
      // The title names the control; the description is a description, not
      // part of the name, so a screen reader does not read the card twice.
      aria-labelledby={interactive ? titleId : undefined}
      aria-describedby={interactive && description ? descriptionId : undefined}
      {...props}
    >
      {element}
    </SNCard>
  );
}
