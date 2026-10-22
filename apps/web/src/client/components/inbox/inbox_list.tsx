'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { SNButton, SNErrorState, SNInput, SNSkeleton } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { formatNumber } from '@sineva/ui/format';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { InboxCountsView, InboxItemView } from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { InboxEmpty } from './inbox_empty';
import { InboxFilters, type InboxFilterValues } from './inbox_filters';
import { INBOX_VIEWS, inboxQueryString, viewCount, type InboxView } from './inbox_model';
import { InboxRow } from './inbox_row';
import type { InboxText } from './inbox_text';

const hasFilters = (values: InboxFilterValues) => Boolean(values.agent_slug || values.kind || values.source_type);

/**
 * The left pane: title, the three views with their numbers, search, filter
 * chips and the rows. The views are links, so each one is an address that can
 * be opened, shared and reached with the back button.
 */
export function InboxList({
  workspaceSlug,
  view,
  counts,
  readOnly,
  specialists,
  filters,
  search,
  searchRef,
  onSearch,
  onFilters,
  onClear,
  items,
  error,
  onRetry,
  openId,
  cursorId,
  text,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  pending,
}: {
  workspaceSlug: string;
  view: InboxView;
  counts: InboxCountsView;
  readOnly: boolean;
  specialists: readonly ShellSpecialistView[];
  filters: InboxFilterValues;
  search: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onSearch: (value: string) => void;
  onFilters: (next: InboxFilterValues) => void;
  onClear: () => void;
  items: readonly InboxItemView[];
  error: boolean;
  onRetry: () => void;
  openId: string | null;
  cursorId: string | null;
  text: InboxText;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  /** A new view or filter is loading. */
  pending: boolean;
}) {
  const t = useTranslations('inbox_ui');
  const locale = useLocale();
  const names = {
    needs_you: t('views.needs_you'),
    updates: t('views.updates'),
    done: t('views.done'),
  } as const;
  // A viewer has nothing that waits for them, so that tab would only ever be empty.
  const views = INBOX_VIEWS.filter((v) => !(readOnly && v === 'needs_you'));

  const href = (target: InboxView) =>
    `/w/${workspaceSlug}/inbox?${inboxQueryString({
      view: target,
      agent_slug: filters.agent_slug,
      // Updates holds only results, so a kind filter would carry over as an empty list.
      kind: target === 'updates' ? undefined : filters.kind,
      source_type: filters.source_type,
      q: filters.q,
    })}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-4 pb-2 pt-4">
        <h1 className="text-lg font-semibold text-text">{t('title')}</h1>
        <nav aria-label={t('tabs')} className="flex gap-1 border-b border-border">
          {views.map((target) => {
            const current = target === view;
            const count = viewCount(counts, target);
            return (
              <Link
                key={target}
                href={href(target)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--color-focus) pointer-coarse:h-11',
                  current
                    ? 'border-action-primary text-text'
                    : 'border-transparent text-text-secondary hover:text-text',
                )}
              >
                {names[target]}
                {count > 0 ? (
                  <span
                    className={cn(
                      'rounded-pill px-1.5 text-xs font-medium tabular-nums',
                      target === 'done' ? 'bg-canvas-alt text-text-tertiary' : 'bg-surface-tint text-text-brand',
                    )}
                  >
                    {formatNumber(count, locale)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <SNInput
          ref={searchRef}
          type="search"
          aria-label={t('search_label')}
          placeholder={t('search_placeholder')}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          startAdornment={<Search aria-hidden="true" />}
          maxLength={80}
        />
        <InboxFilters view={view} specialists={specialists} values={filters} onChange={onFilters} />
      </div>

      <div
        className={cn('min-h-0 flex-1 overflow-y-auto px-2 pb-4 transition-opacity duration-150', pending && 'opacity-60')}
        aria-busy={pending || undefined}
      >
        {error ? (
          <div className="p-4">
            <SNErrorState
              title={t('list_error_title')}
              message={t('list_error_body')}
              onRetry={onRetry}
              retryLabel={t('try_again')}
              headingLevel={2}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <InboxEmpty view={view} hasFilters={hasFilters(filters)} query={filters.q ?? ''} onClear={onClear} />
          </div>
        ) : (
          <>
            <ul aria-label={names[view]} className="space-y-0.5">
              {items.map((item, index) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  text={text}
                  open={item.id === openId}
                  cursor={item.id === cursorId}
                  delay={Math.min(index, 8) * 30}
                  onOpen={onOpen}
                />
              ))}
            </ul>
            {hasMore ? (
              <div className="flex justify-center p-3">
                <SNButton variant="secondary" loading={loadingMore} onClick={onLoadMore}>
                  {t('show_more')}
                </SNButton>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Five rows of the right shape while the first list loads. */
export function InboxListSkeleton() {
  return (
    <ul className="space-y-1 px-2" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex items-start gap-3 px-3 py-3">
          <SNSkeleton variant="rect" className="size-10 rounded-sm" />
          <div className="flex-1 space-y-2">
            <SNSkeleton variant="text" className="h-4 w-2/3" />
            <SNSkeleton variant="text" className="h-3 w-full" />
            <SNSkeleton variant="text" className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
