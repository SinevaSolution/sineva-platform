'use client';

import { CheckCheck, Inbox, SearchX, SlidersHorizontal, Sparkles, ShieldCheck, MessageCircleQuestionMark } from 'lucide-react';
import Link from 'next/link';
import { SNButton, SNEmptyState } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { InboxView } from './inbox_model';

/**
 * What the list shows when it has no rows. Four different reasons, four
 * different messages: nothing waits (a small celebration), nothing yet in
 * Updates or Done, a filter that matched nothing, a search that found nothing.
 */
export function InboxEmpty({
  view,
  hasFilters,
  query,
  onClear,
}: {
  view: InboxView;
  hasFilters: boolean;
  query: string;
  onClear: () => void;
}) {
  const t = useTranslations('inbox_ui');

  if (query) {
    return (
      <SNEmptyState
        size="sm"
        icon={SearchX}
        title={t('empty_search_title', { query })}
        description={t('empty_search_body')}
        action={
          <SNButton size="sm" variant="secondary" onClick={onClear}>
            {t('clear_filters')}
          </SNButton>
        }
      />
    );
  }
  if (hasFilters) {
    return (
      <SNEmptyState
        size="sm"
        icon={SlidersHorizontal}
        title={t('empty_filtered_title')}
        description={t('empty_filtered_body')}
        action={
          <SNButton size="sm" variant="secondary" onClick={onClear}>
            {t('clear_filters')}
          </SNButton>
        }
      />
    );
  }
  if (view === 'needs_you') {
    return <SNEmptyState size="md" pose="thumbs-up" title={t('caught_up_title')} description={t('caught_up_body')} />;
  }
  if (view === 'updates') {
    return <SNEmptyState size="sm" icon={Sparkles} title={t('empty_updates_title')} description={t('empty_updates_body')} />;
  }
  return <SNEmptyState size="sm" icon={CheckCheck} title={t('empty_done_title')} description={t('empty_done_body')} />;
}

/** The very first visit: nothing has ever landed here, so say what will. */
export function InboxFirstRun({ workspaceSlug }: { workspaceSlug: string }) {
  const t = useTranslations('inbox_ui');
  const rows = [
    { icon: ShieldCheck, title: t('first_run_drafts_title'), body: t('first_run_drafts_body') },
    { icon: MessageCircleQuestionMark, title: t('first_run_questions_title'), body: t('first_run_questions_body') },
    { icon: Sparkles, title: t('first_run_done_title'), body: t('first_run_done_body') },
  ];
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="anim-rise flex max-w-md flex-col items-center gap-6">
        <SNEmptyState
          size="lg"
          pose="wave"
          title={t('first_run_title')}
          description={t('first_run_body')}
          action={
            <SNButton asChild variant="primary">
              <Link href={`/w/${workspaceSlug}/new`}>{t('first_run_cta')}</Link>
            </SNButton>
          }
        />
        <ul className="w-full space-y-3">
          {rows.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3 rounded-md bg-canvas-alt px-4 py-3">
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-brand" strokeWidth={1.75} />
              <div className="text-start">
                <p className="text-sm font-medium text-text">{title}</p>
                <p className="text-[13px] text-text-secondary">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The right pane on a wide screen while nothing is open. */
export function InboxPickOne() {
  const t = useTranslations('inbox_ui');
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <SNEmptyState size="sm" icon={Inbox} title={t('pick_title')} description={t('pick_body')} />
    </div>
  );
}
