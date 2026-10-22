'use client';

import * as React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { SNBadge, SNButton, SNDropzone, SNIconButton, SNProgressBar } from '@sineva/ui';
import { formatFileSize } from '@sineva/ui/format';
import { useLocale, useTranslations } from '@/i18n/provider';
import { fileKindFromName } from './library_model';
import { LibraryFileIcon } from './library_parts';
import type { LibraryUploadItem } from './use_library_uploads';

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp';
const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_DROP = 10;

/**
 * The large drop zone and the cards of files on their way. Dropping, clicking
 * and keyboard (Enter or Space on the zone) all start the same upload. The zone
 * says where files will go and that they take that collection's access, so
 * nobody has to answer an access question per file.
 */
export function LibraryUploadZone({
  items,
  intoName,
  onFiles,
  onRetry,
  onRemove,
}: {
  items: readonly LibraryUploadItem[];
  /** Name of the collection being viewed, or null for the top level. */
  intoName: string | null;
  onFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations('library_ui');
  const locale = useLocale();

  return (
    <section aria-label={t('zone.section')} className="anim-rise space-y-3 [--d:80ms]">
      <SNDropzone
        multiple
        maxFiles={MAX_FILES_PER_DROP}
        accept={ACCEPT}
        maxBytes={MAX_BYTES}
        label={t('zone.label')}
        hint={t('zone.hint')}
        onFilesChange={onFiles}
        messages={{ type: t('zone.type_error'), size: t('zone.size_error'), count: t('zone.count_error') }}
      />
      <p className="text-xs text-text-secondary">
        {intoName ? t('zone.into', { name: intoName }) : t('zone.into_top')}
      </p>
      {items.length > 0 ? (
        <ul aria-label={t('queue.label')} className="grid gap-2 sm:grid-cols-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="anim-rise space-y-2 rounded-lg border border-border bg-surface p-3"
              style={{ '--d': `${Math.min(index, 5) * 60}ms` } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <LibraryFileIcon kind={fileKindFromName(item.file.name)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{item.file.name}</p>
                  <p className="text-xs text-text-secondary">{formatFileSize(item.file.size, locale)}</p>
                </div>
                {item.status !== 'sent' && item.status !== 'uploading' ? (
                  <SNIconButton
                    label={t('queue.remove_named', { name: item.file.name })}
                    tooltip={t('queue.remove')}
                    size="sm"
                    onClick={() => onRemove(item.id)}
                  >
                    <X aria-hidden="true" />
                  </SNIconButton>
                ) : null}
              </div>
              <div role="status" aria-live="polite" className="space-y-1.5">
                <QueueStatus item={item} />
                {item.status === 'uploading' ? <SNProgressBar label={t('queue.progress', { name: item.file.name })} /> : null}
                {item.status === 'failed' && item.error ? (
                  <p role="alert" className="text-xs text-danger">
                    {item.error}
                  </p>
                ) : null}
              </div>
              {item.status === 'failed' ? (
                <SNButton size="xs" variant="secondary" onClick={() => onRetry(item.id)}>
                  <RotateCcw aria-hidden="true" />
                  {t('queue.retry')}
                </SNButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function QueueStatus({ item }: { item: LibraryUploadItem }) {
  const t = useTranslations('library_ui');
  switch (item.status) {
    case 'waiting':
      return <SNBadge tone="neutral">{t('queue.waiting')}</SNBadge>;
    case 'uploading':
      return <SNBadge tone="running">{t('queue.uploading')}</SNBadge>;
    case 'sent':
      return <SNBadge tone="success">{t('queue.sent')}</SNBadge>;
    case 'failed':
      return <SNBadge tone="failed">{t('queue.failed')}</SNBadge>;
  }
}
