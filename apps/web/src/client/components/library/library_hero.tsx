'use client';

import * as React from 'react';
import { AlertTriangle, BookOpenCheck, Hourglass } from 'lucide-react';
import {
  SNButton,
  SNProgressBar,
} from '@sineva/ui';
import { formatFileSize } from '@sineva/ui/format';
import { cn } from '@/client/components/ui/cn';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { LibrarySummaryView, LibraryUsageView } from '@/shared/library_view';

/**
 * The friendly top of the page: Sino with a magnifier, what the Library is
 * for in one line, and three numbers that answer "is Sino ready?". Files that
 * could not be read count as "need a look" with the ones that partly could not:
 * both need the person to do something.
 */
export function LibraryHero({
  summary,
  usage,
  onStorageDetails,
  action,
}: {
  summary: LibrarySummaryView;
  usage: LibraryUsageView | null;
  onStorageDetails: () => void;
  /** The Add menu; absent for a viewer, who cannot add. */
  action: React.ReactNode;
}) {
  const t = useTranslations('library_ui');
  const locale = useLocale();
  const attention = summary.by_status.needs_attention + summary.by_status.failed;
  const limit = usage?.storage_limit_bytes ?? null;

  return (
    <header className="anim-rise relative isolate overflow-hidden rounded-xl border border-border bg-surface-tint">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-(image:--gradient-aurora)" />
      <div className="flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-center md:gap-8">
        <SNSinoFigure pose="magnifier" size={132} priority className="mx-auto md:mx-0" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-brand">{t('hero.eyebrow')}</p>
            <h1 className="text-2xl font-semibold text-text sm:text-3xl">{t('hero.title')}</h1>
            <p className="max-w-xl text-[15px] text-text-secondary">{t('hero.body')}</p>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label={t('hero.summary_label')}>
            <SummaryChip icon={BookOpenCheck} text={t('hero.chip_ready', { count: summary.by_status.ready })} />
            <SummaryChip icon={Hourglass} text={t('hero.chip_reading', { count: summary.by_status.reading })} />
            <SummaryChip
              icon={AlertTriangle}
              tone={attention > 0 ? 'warning' : 'neutral'}
              text={t('hero.chip_attention', { count: attention })}
            />
          </ul>
          {usage ? (
            <div className="max-w-md space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                <span>
                  {limit
                    ? t('hero.storage', { used: formatFileSize(usage.storage_bytes, locale), limit: formatFileSize(limit, locale) })
                    : t('hero.storage_only', { used: formatFileSize(usage.storage_bytes, locale) })}
                </span>
                <SNButton size="xs" variant="ghost" onClick={onStorageDetails}>
                  {t('hero.storage_details')}
                </SNButton>
              </div>
              {limit ? (
                <SNProgressBar
                  className="h-1"
                  label={t('hero.storage_label')}
                  value={Math.min(usage.storage_bytes, limit)}
                  max={limit}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0 self-start md:self-center">{action}</div> : null}
      </div>
    </header>
  );
}

function SummaryChip({
  icon: Icon,
  text,
  tone = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  text: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <li
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium',
        tone === 'warning' ? 'bg-warning-surface text-warning' : 'bg-surface text-text-secondary',
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {text}
    </li>
  );
}
