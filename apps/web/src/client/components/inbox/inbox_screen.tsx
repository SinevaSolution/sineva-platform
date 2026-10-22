'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SNBadge, SNButton, SNField, SNSelect, SNStatusChip } from '@sineva/ui';
import { formatDate } from '@sineva/ui/format';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  InboxCountsView,
  InboxItemView,
  InboxListView,
  InboxTabView,
} from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { InboxDetail } from './inbox_detail';

const tabs = {
  needs_review: 'views.needs_review',
  needs_input: 'views.needs_input',
  done: 'views.done',
} as const;

function toMessageParams(
  params?: Record<string, unknown>,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === 'string' || typeof val === 'number') {
      result[key] = val;
    }
  }
  return result;
}

export function InboxScreen({
  workspaceId,
  workspaceSlug,
  tab,
  counts,
  list,
  selectedItem,
  readOnly,
  specialists,
  selectedSpecialist = '',
  selectedSource = '',
  cursor,
}: {
  workspaceId: string;
  workspaceSlug: string;
  tab: InboxTabView;
  counts: InboxCountsView;
  list: InboxListView;
  selectedItem: InboxItemView | null;
  readOnly: boolean;
  specialists: ShellSpecialistView[];
  selectedSpecialist?: string;
  selectedSource?: string;
  cursor?: string;
}) {
  const t = useTranslations('inbox_ui');
  const tRoot = useTranslations('');
  const locale = useLocale();
  const router = useRouter();

  const url = React.useCallback(
    (values: Record<string, string>) =>
      `/w/${workspaceSlug}/inbox?${new URLSearchParams({
        tab,
        ...(cursor ? { cursor } : {}),
        ...(selectedSpecialist ? { agent_slug: selectedSpecialist } : {}),
        ...(selectedSource ? { source_type: selectedSource } : {}),
        ...values,
      })}`,
    [workspaceSlug, tab, selectedSpecialist, selectedSource, cursor],
  );

  const filteredItems = React.useMemo(() => {
    if (!selectedSource) return list.items;
    return list.items.filter((item) => item.source.type === selectedSource);
  }, [list.items, selectedSource]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            '[role="dialog"], [role="alertdialog"], [role="combobox"], [role="listbox"]',
          )) ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'j') {
        event.preventDefault();
        const currentIndex = filteredItems.findIndex((i) => i.id === selectedItem?.id);
        const nextIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0;
        if (filteredItems[nextIndex]) {
          router.push(url({ item: filteredItems[nextIndex].id }));
        }
      } else if (event.key === 'k') {
        event.preventDefault();
        const currentIndex = filteredItems.findIndex((i) => i.id === selectedItem?.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1;
        if (filteredItems[prevIndex]) {
          router.push(url({ item: filteredItems[prevIndex].id }));
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedItem, router, url]);

  const specialistMap = React.useMemo(
    () => new Map(specialists.map((s) => [s.agent_slug, s.display_name])),
    [specialists],
  );

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 p-5 sm:p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <nav aria-label={t('tabs')} className="flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key, label]) => (
          <SNButton asChild key={key} variant={tab === key ? 'primary' : 'secondary'}>
            <Link
              href={url({ tab: key, item: '', cursor: '' })}
              aria-current={tab === key ? 'page' : undefined}
            >
              {t(label)} ({counts[key as InboxTabView]})
            </Link>
          </SNButton>
        ))}
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <SNField label={t('specialist_filter')}>
          <SNSelect
            name="agent_slug"
            value={selectedSpecialist}
            onValueChange={(val) => router.push(url({ agent_slug: val, item: '', cursor: '' }))}
            options={[
              { value: '', label: t('all_specialists') },
              ...specialists.map((s) => ({ value: s.agent_slug, label: s.display_name })),
            ]}
          />
        </SNField>

        <SNField label={t('source_filter')}>
          <SNSelect
            name="source_type"
            value={selectedSource}
            onValueChange={(val) => router.push(url({ source_type: val, item: '', cursor: '' }))}
            options={[
              { value: '', label: t('all_sources') },
              { value: 'chat', label: t('from_chat') },
              { value: 'room', label: t('from_room') },
              { value: 'system', label: t('from_system') },
            ]}
          />
        </SNField>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className={selectedItem ? 'hidden lg:block' : undefined}>
          {filteredItems.length === 0 ? (
            <p className="rounded-md border border-border p-6 text-sm text-text-secondary">
              {tab === 'needs_review' || tab === 'needs_input' ? t('empty_caught_up') : t('empty')}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {filteredItems.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={url({ item: entry.id })}
                    className="block space-y-2 rounded-sm p-4 focus-visible:outline-2 focus-visible:outline-action-primary"
                    aria-current={selectedItem?.id === entry.id ? 'page' : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-text">{entry.title}</span>
                      {entry.unread ? <SNStatusChip tone="info" label={t('unread')} /> : null}
                    </div>

                    {entry.summary?.key ? (
                      <p className="text-xs text-text-secondary">
                        {tRoot.has(entry.summary.key)
                          ? tRoot(entry.summary.key, toMessageParams(entry.summary.params))
                          : null}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-text-secondary">
                      {entry.kind === 'approval' ? (
                        <SNBadge tone="review">{t('needs_review_badge')}</SNBadge>
                      ) : entry.kind === 'input_request' ? (
                        <SNBadge tone="brand">{t('needs_input_badge')}</SNBadge>
                      ) : null}

                      {entry.agent_slug && specialistMap.has(entry.agent_slug) ? (
                        <SNBadge tone="neutral">{specialistMap.get(entry.agent_slug)}</SNBadge>
                      ) : null}

                      <span>
                        {entry.source.type === 'chat'
                          ? t('from_chat')
                          : entry.source.type === 'room'
                            ? t('from_room')
                            : t('from_system')}
                      </span>

                      <span>·</span>
                      <span>{formatDate(entry.created_at, locale)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {list.next_cursor ? (
            <SNButton asChild className="mt-3">
              <Link href={url({ cursor: list.next_cursor })}>{t('next')}</Link>
            </SNButton>
          ) : null}
        </div>

        {selectedItem ? (
          <div className="space-y-3">
            <SNButton asChild className="lg:hidden">
              <Link href={url({ item: '' })}>{t('back_to_list')}</Link>
            </SNButton>
            <InboxDetail
              key={`${selectedItem.id}-${selectedItem.approval?.version ?? selectedItem.input_request?.version ?? selectedItem.state}`}
              item={selectedItem}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              readOnly={readOnly}
            />
          </div>
        ) : (
          <p className="p-5 text-sm text-text-secondary">{t('select_item')}</p>
        )}
      </div>
    </section>
  );
}
