import * as React from 'react';

/** Thin header row at the top of the content panel (44 px, hairline). */
export function PageHeader({
  title,
  leading,
  actions,
}: {
  title: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
      {leading}
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{title}</h1>
      {actions}
    </header>
  );
}
