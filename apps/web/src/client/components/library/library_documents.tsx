'use client';

import * as React from 'react';
import { FolderClosed, LayoutGrid, List, PanelLeft, Search, X } from 'lucide-react';
import { SNIconButton, SNInput, SNProgressBar, SNSegmented, SNSelect } from '@sineva/ui';
import { formatDate, formatFileSize } from '@sineva/ui/format';
import { cn } from '@/client/components/ui/cn';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { LibraryDocumentView } from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { LibraryChip } from './library_chip';
import { fileKind, uiStatus, type LibraryUiStatus } from './library_model';
import { LibraryFileIcon, LibraryStatusPill, LibraryUsedBy } from './library_parts';

export type LibraryView = 'list' | 'cards';
export type StatusFilter = '' | 'ready' | 'reading' | 'needs_attention' | 'failed';

const STATUS_CHIPS: ReadonlyArray<{ value: StatusFilter; key: 'filter.all' | 'filter.ready' | 'filter.reading' | 'filter.needs_look' | 'filter.cant_read' }> = [
  { value: '', key: 'filter.all' },
  { value: 'ready', key: 'filter.ready' },
  { value: 'reading', key: 'filter.reading' },
  { value: 'needs_attention', key: 'filter.needs_look' },
  { value: 'failed', key: 'filter.cant_read' },
];

const SORTS = [
  { value: 'newest', key: 'sort.newest' },
  { value: 'oldest', key: 'sort.oldest' },
  { value: 'name', key: 'sort.name' },
  { value: 'size', key: 'sort.size' },
] as const;

/**
 * Search, filters, sort and the view switch. Everything except the view lives
 * in the URL (the caller turns a change into a navigation), so a filtered list
 * can be linked and survives a reload. The search waits for a pause in typing
 * before it navigates, and Enter goes at once.
 */
export function LibraryToolbar({
  q,
  status,
  usedBy,
  sort,
  view,
  specialists,
  onChange,
  onView,
  onOpenCollections,
}: {
  q: string;
  status: StatusFilter;
  /** '' (anyone), `everyone`, or a specialist slug. */
  usedBy: string;
  sort: string;
  view: LibraryView;
  specialists: readonly ShellSpecialistView[];
  onChange: (change: { q?: string; status?: StatusFilter; usedBy?: string; sort?: string }) => void;
  onView: (view: LibraryView) => void;
  onOpenCollections: () => void;
}) {
  const t = useTranslations('library_ui');
  const [draft, setDraft] = React.useState(q);
  const [seenQ, setSeenQ] = React.useState(q);
  // The URL is the truth: a navigation from elsewhere (clear filters) resets the box.
  if (seenQ !== q) {
    setSeenQ(q);
    setDraft(q);
  }
  const pushQuery = React.useEffectEvent((next: string) => onChange({ q: next }));
  React.useEffect(() => {
    const next = draft.trim();
    if (next === q) return;
    const timer = window.setTimeout(() => pushQuery(next), 400);
    return () => window.clearTimeout(timer);
  }, [draft, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SNIconButton label={t('toolbar.collections')} tooltip={t('toolbar.collections')} variant="secondary" className="lg:hidden" onClick={onOpenCollections}>
          <PanelLeft aria-hidden="true" />
        </SNIconButton>
        <form
          role="search"
          className="min-w-0 flex-1 basis-56"
          onSubmit={(event) => {
            event.preventDefault();
            onChange({ q: draft.trim() });
          }}
        >
          <SNInput
            type="search"
            aria-label={t('toolbar.search')}
            placeholder={t('toolbar.search_placeholder')}
            value={draft}
            maxLength={100}
            onChange={(event) => setDraft(event.target.value)}
            startAdornment={<Search />}
            endAdornment={
              draft ? (
                <SNIconButton
                  label={t('toolbar.clear_search')}
                  size="sm"
                  onClick={() => {
                    setDraft('');
                    onChange({ q: '' });
                  }}
                >
                  <X aria-hidden="true" />
                </SNIconButton>
              ) : undefined
            }
          />
        </form>
        <SNSelect
          aria-label={t('toolbar.used_by')}
          className="w-44"
          value={usedBy}
          onValueChange={(value) => onChange({ usedBy: value })}
          options={[
            { value: '', label: t('toolbar.used_by_anyone') },
            { value: 'everyone', label: t('used_by.everyone') },
            ...specialists.map((s) => ({ value: s.agent_slug, label: s.display_name })),
          ]}
        />
        <SNSelect
          aria-label={t('toolbar.sort')}
          className="w-40"
          value={sort}
          onValueChange={(value) => onChange({ sort: value })}
          options={SORTS.map((entry) => ({ value: entry.value, label: t(entry.key) }))}
        />
        <SNSegmented
          aria-label={t('toolbar.view')}
          value={view}
          onValueChange={(value) => onView(value as LibraryView)}
          options={[
            {
              value: 'list',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <List aria-hidden="true" className="size-4" />
                  <span className="sr-only sm:not-sr-only">{t('toolbar.view_list')}</span>
                </span>
              ),
            },
            {
              value: 'cards',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <LayoutGrid aria-hidden="true" className="size-4" />
                  <span className="sr-only sm:not-sr-only">{t('toolbar.view_cards')}</span>
                </span>
              ),
            },
          ]}
        />
      </div>
      <div role="group" aria-label={t('toolbar.status')} className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((chip) => (
          <LibraryChip key={chip.value || 'all'} pressed={status === chip.value} onClick={() => onChange({ status: chip.value })}>
            {t(chip.key)}
          </LibraryChip>
        ))}
      </div>
    </div>
  );
}

function ReadingProgress({ document }: { document: LibraryDocumentView }) {
  const t = useTranslations('library_ui');
  const progress = document.status_detail?.progress;
  if (document.status !== 'processing' || !progress) return null;
  const text = t('status.reading_progress', { current: progress.current, total: progress.total });
  return (
    <div className="space-y-1">
      <p className="text-xs text-text-secondary">{text}</p>
      <SNProgressBar className="h-1" label={text} value={progress.current} max={progress.total} />
    </div>
  );
}

function RowHint({ status }: { status: LibraryUiStatus }) {
  const t = useTranslations('library_ui');
  if (status !== 'needs_look' && status !== 'cant_read') return null;
  return <p className="text-xs text-warning">{t(status === 'needs_look' ? 'row.needs_look_hint' : 'row.cant_read_hint')}</p>;
}

/**
 * The documents as rows (default) or cards. A whole row is one button that
 * opens the detail drawer, so the target is large and the keyboard path is
 * short; nothing interactive sits inside it. Rows rise in a short stagger,
 * which the global reduced-motion rule turns off.
 */
export function LibraryDocumentList({
  items,
  view,
  collectionNames,
  specialists,
  selectedId,
  onOpen,
}: {
  items: readonly LibraryDocumentView[];
  view: LibraryView;
  collectionNames: ReadonlyMap<string, string>;
  specialists: readonly ShellSpecialistView[];
  selectedId: string | null;
  onOpen: (document: LibraryDocumentView) => void;
}) {
  const t = useTranslations('library_ui');
  const locale = useLocale();

  return (
    <ul
      aria-label={t('list.label')}
      className={cn(view === 'cards' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface')}
    >
      {items.map((document, index) => {
        const status = uiStatus(document.status);
        const kind = fileKind(document.mime_type, document.source_type);
        const collection = document.folder_id ? (collectionNames.get(document.folder_id) ?? null) : null;
        const stagger = { '--d': `${Math.min(index, 8) * 40}ms` } as React.CSSProperties;
        const common = 'anim-rise block w-full text-start transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';
        const selected = selectedId === document.id;
        return (
          <li key={document.id} style={stagger} className={cn(view === 'cards' && 'anim-rise')}>
            <button
              type="button"
              aria-label={t('row.open', { name: document.title })}
              aria-haspopup="dialog"
              aria-current={selected ? 'true' : undefined}
              onClick={() => onOpen(document)}
              className={cn(
                common,
                view === 'cards'
                  ? 'h-full space-y-3 rounded-lg border border-border bg-surface p-4 hover:border-border-strong hover:shadow-sm'
                  : 'p-3 hover:bg-(--state-hover) sm:px-4',
                selected && 'bg-surface-tint',
              )}
            >
              {view === 'cards' ? (
                <>
                  <div className="flex items-start gap-3">
                    <LibraryFileIcon kind={kind} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-semibold text-text">{document.title}</p>
                      <Where collection={collection} />
                    </div>
                  </div>
                  <ReadingProgress document={document} />
                  <RowHint status={status} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <LibraryStatusPill status={status} />
                    <LibraryUsedBy scopes={document.scopes} specialists={specialists} />
                  </div>
                  <p className="text-xs text-text-secondary">
                    {formatFileSize(document.byte_size, locale)} · {t('row.updated', { date: formatDate(document.updated_at, locale) })}
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <LibraryFileIcon kind={kind} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{document.title}</p>
                      <Where collection={collection} />
                      <RowHint status={status} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ps-12 md:ps-0">
                    <div className="w-28 shrink-0 space-y-1">
                      <LibraryStatusPill status={status} />
                      <ReadingProgress document={document} />
                    </div>
                    <LibraryUsedBy className="w-24 shrink-0" scopes={document.scopes} specialists={specialists} />
                    <span className="text-xs text-text-secondary md:w-28 md:text-end">
                      {formatDate(document.updated_at, locale)}
                    </span>
                  </div>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Where({ collection }: { collection: string | null }) {
  const t = useTranslations('library_ui');
  return (
    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-secondary">
      <FolderClosed aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{collection ?? t('row.top')}</span>
    </p>
  );
}
