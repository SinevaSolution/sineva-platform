import * as React from 'react';
import { cx } from '../../lib/cx';

export interface SNFormSectionProps {
  title: string;
  description?: string;
  headingLevel?: 2 | 3 | 4;
  /** Hairlines between and around the children (settings rows). */
  divided?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * A quiet group of fields under a small title. A labelled region, so a screen
 * reader user can jump between sections of a long form. No box around the
 * group: with `divided`, hairlines between rows carry the structure.
 */
export function SNFormSection({
  title,
  description,
  headingLevel = 2,
  divided = false,
  className,
  style,
  children,
}: SNFormSectionProps) {
  const id = React.useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <section aria-labelledby={id} className={className} style={style}>
      <Heading id={id} className="pb-2 text-[13px] font-semibold text-text">
        {title}
      </Heading>
      {description ? <p className="-mt-1 pb-2 text-[13px] text-text-tertiary">{description}</p> : null}
      <div className={cx(divided && 'divide-y divide-border border-y border-border')}>{children}</div>
    </section>
  );
}
