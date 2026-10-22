'use client';

import * as React from 'react';
import {
  Check,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Presentation,
  StickyNote,
  Upload,
  Users,
} from 'lucide-react';
import { SNBadge, SNTooltip, type SNBadgeTone } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { useTranslations } from '@/i18n/provider';
import type { LibraryScopeView } from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { accessSummary, type LibraryFileKind, type LibraryUiStatus } from './library_model';
import { useLibrarySquads } from './library_squads';

// Small display pieces the Library screen, drawer and rows share.

const KIND_ICONS: Record<LibraryFileKind, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  slides: Presentation,
  image: ImageIcon,
  text: FileText,
  note: StickyNote,
};

const TILE_SIZES = { sm: 'size-9 rounded-sm', md: 'size-11 rounded-md', lg: 'size-14 rounded-lg' } as const;
const GLYPH_SIZES = { sm: 'size-4.5', md: 'size-5.5', lg: 'size-7' } as const;

/** A tinted tile with the glyph of the file type. The type is also written out wherever it matters, so the tile is decoration. */
export function LibraryFileIcon({
  kind,
  size = 'md',
  className,
}: {
  kind: LibraryFileKind;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  const Icon = KIND_ICONS[kind];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-surface-tint text-text-brand',
        TILE_SIZES[size],
        className,
      )}
    >
      <Icon aria-hidden="true" className={GLYPH_SIZES[size]} />
    </span>
  );
}

const STATUS_BADGE: Record<LibraryUiStatus, { tone: SNBadgeTone; key: 'status.reading' | 'status.ready' | 'status.needs_look' | 'status.cant_read' }> = {
  reading: { tone: 'running', key: 'status.reading' },
  ready: { tone: 'success', key: 'status.ready' },
  needs_look: { tone: 'review', key: 'status.needs_look' },
  cant_read: { tone: 'failed', key: 'status.cant_read' },
};

/** The plain-language status. Colour never carries it alone: every tone has an icon and the word. */
export function LibraryStatusPill({ status }: { status: LibraryUiStatus }) {
  const t = useTranslations('library_ui');
  const { tone, key } = STATUS_BADGE[status];
  return (
    <SNBadge tone={tone} icon={status === 'ready' ? <Check /> : undefined}>
      {t(key)}
    </SNBadge>
  );
}

/** The state of a file that is still travelling to Sino. */
export function LibraryUploadingPill() {
  const t = useTranslations('library_ui');
  return (
    <SNBadge tone="brand" icon={<Upload />}>
      {t('status.uploading')}
    </SNBadge>
  );
}

const MAX_FACES = 3;

/**
 * "Used by": Everyone, or the chosen specialists as overlapping faces. The
 * names are written out for screen readers and in the tooltip, so the faces do
 * not rely on colour or on a letter.
 */
export function LibraryUsedBy({
  scopes,
  specialists,
  className,
}: {
  scopes: readonly LibraryScopeView[];
  specialists: readonly ShellSpecialistView[];
  className?: string;
}) {
  const t = useTranslations('library_ui');
  const squadOptions = useLibrarySquads();
  const access = accessSummary(scopes);
  if (access.everyone) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary', className)}>
        <Users aria-hidden="true" className="size-3.5" />
        {t('used_by.everyone')}
      </span>
    );
  }
  const squads = access.squads.map((id) => squadOptions.find((squad) => squad.id === id)?.name ?? null).filter((name): name is string => name !== null);
  const named = access.specialists.map((slug) => ({
    slug,
    name: specialists.find((s) => s.agent_slug === slug)?.display_name ?? slug,
  }));
  const shown = named.slice(0, MAX_FACES);
  const hidden = named.length - shown.length;
  const label = [...named.map((entry) => entry.name), ...squads].join(', ');
  return (
    <SNTooltip label={label}>
      <span className={cn('inline-flex items-center', className)}>
        <span className="sr-only">{label}</span>
        <span aria-hidden="true" className="flex -space-x-1.5 rtl:space-x-reverse">
          {shown.map((entry) => (
            <SNSpecialistTile
              key={entry.slug}
              agentSlug={entry.slug}
              name={entry.name}
              size="md"
              className="size-6 rounded-full text-[10px] ring-2 ring-surface"
            />
          ))}
          {hidden > 0 ? (
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-canvas-alt text-[10px] font-semibold text-text-secondary ring-2 ring-surface">
              +{hidden}
            </span>
          ) : null}
        </span>
        {squads.length > 0 ? (
          <span aria-hidden="true" className={cn('inline-flex items-center gap-1 text-xs font-medium text-text-secondary', named.length > 0 && 'ms-2')}>
            <Users className="size-3.5" />
            {squads.length === 1 ? squads[0] : t('used_by.squads_many', { count: squads.length })}
          </span>
        ) : null}
      </span>
    </SNTooltip>
  );
}
