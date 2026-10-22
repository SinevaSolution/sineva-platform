'use client';

import * as React from 'react';
import Link from 'next/link';
import { Eye, FileUp, MessageCircle, RotateCw, Trash2 } from 'lucide-react';
import { SNBanner, SNButton, SNDrawer, SNField, SNInput, SNProgressBar, SNSelect, SNSwitch } from '@sineva/ui';
import { formatDate, formatFileSize, formatNumber } from '@sineva/ui/format';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { LibraryDocumentView } from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { LibraryAccessPicker } from './library_access_picker';
import {
  accessKey,
  accessSummary,
  fileKind,
  flattenCollectionTree,
  sameAccess,
  scopeInputs,
  uiStatus,
  type AccessChoice,
  type CollectionNode,
  type LibraryFileKind,
  type ScopeInput,
} from './library_model';
import { LibraryFileIcon, LibraryStatusPill } from './library_parts';

// Literal keys on purpose: the key-usage check follows string literals, and a
// computed key would hide them from it.
const REASONS = {
  password_protected: 'reason.password_protected',
  unreadable_pages: 'reason.unreadable_pages',
  no_text_found: 'reason.no_text_found',
  hidden_text_detected: 'reason.hidden_text_detected',
  unsupported_content: 'reason.unsupported_content',
  parse_failed: 'reason.parse_failed',
  ocr_failed: 'reason.ocr_failed',
  embedding_failed: 'reason.embedding_failed',
  too_many_pages: 'reason.too_many_pages',
  storage_object_missing: 'reason.storage_object_missing',
  ingest_service_unavailable: 'reason.ingest_service_unavailable',
  ingest_service_error: 'reason.ingest_service_error',
} as const;

const KIND_LABELS: Record<LibraryFileKind, 'kind.pdf' | 'kind.word' | 'kind.excel' | 'kind.slides' | 'kind.image' | 'kind.text' | 'kind.note'> = {
  pdf: 'kind.pdf',
  word: 'kind.word',
  excel: 'kind.excel',
  slides: 'kind.slides',
  image: 'kind.image',
  text: 'kind.text',
  note: 'kind.note',
};

const TOP = '__top__';

export interface LibraryDocumentDrawerProps {
  document: LibraryDocumentView;
  workspaceSlug: string;
  specialists: readonly ShellSpecialistView[];
  tree: readonly CollectionNode[];
  uploadedBy: string | null;
  /** Rename, move, change access, read again, replace and delete. */
  canManage: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onRename: (title: string) => void;
  onMove: (folderId: string | null) => void;
  /** `inherit` puts the file back on its collection's access. */
  onAccess: (change: { scopes: ScopeInput[] } | 'inherit') => void;
  onTryAgain: () => void;
  onReplace: () => void;
  onSeeText: () => void;
  onDelete: () => void;
}

/**
 * Everything about one file in a side sheet (a bottom sheet on a phone): what
 * Sino made of it, where it lives, who can use it, and what can be done.
 * Editing controls show only to people who may manage the Library; everyone
 * else reads the same facts. The file's access is its own list unless "Same as
 * the collection" is on, in which case the switch shows what it follows and the
 * picker is locked.
 */
export function LibraryDocumentDrawer(props: LibraryDocumentDrawerProps) {
  const { document, workspaceSlug, specialists, tree, canManage, pending, error } = props;
  const t = useTranslations('library_ui');
  const locale = useLocale();
  const status = uiStatus(document.status);
  const kind = fileKind(document.mime_type, document.source_type);
  const flat = React.useMemo(() => flattenCollectionTree(tree), [tree]);
  const collection = flat.find((node) => node.id === document.folder_id) ?? null;

  const [title, setTitle] = React.useState(document.title);
  const [access, setAccess] = React.useState<AccessChoice>(() => accessSummary(document.scopes));
  // The drawer is keyed by the document, but a save changes the document under
  // it: take the saved values back so "unsaved" is judged against the server.
  // Compared by value, not identity: the page refreshes while files are being
  // read, which hands over new arrays that must not wipe an edit in progress.
  const savedAccess = accessSummary(document.scopes);
  const savedKey = accessKey(savedAccess);
  const [seen, setSeen] = React.useState({ title: document.title, access: savedKey });
  if (seen.title !== document.title || seen.access !== savedKey) {
    setSeen({ title: document.title, access: savedKey });
    if (seen.title !== document.title) setTitle(document.title);
    if (seen.access !== savedKey) setAccess(savedAccess);
  }

  const titleChanged = title.trim() !== '' && title.trim() !== document.title;
  const saved = savedAccess;
  const accessChanged = !sameAccess(access, saved);
  const scopes = scopeInputs(access);

  const reason = document.status_detail?.reason_code as keyof typeof REASONS | undefined;
  const flaggedPages = document.status_detail?.pages ?? [];
  const progress = document.status === 'processing' ? document.status_detail?.progress : undefined;
  const readingText = progress ? t('status.reading_progress', { current: progress.current, total: progress.total }) : null;

  const askParams = new URLSearchParams({ prompt: t('drawer.ask_prompt', { title: document.title }) });
  if (!saved.everyone && saved.specialists[0]) askParams.set('with', saved.specialists[0]);

  const specialistNames = (access.everyone ? [] : access.specialists).map(
    (slug) => specialists.find((s) => s.agent_slug === slug)?.display_name ?? slug,
  );
  const followed = collection ? accessSummary(collection.scopes) : { everyone: true, specialists: [] as string[], squads: [] as string[] };

  return (
    <SNDrawer
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      side="end"
      width="panel"
      title={t('drawer.title')}
      closeLabel={t('close')}
    >
      <div className="h-full space-y-6 overflow-y-auto p-5 pt-14 md:pt-5">
        <div className="flex items-start gap-3">
          <LibraryFileIcon kind={kind} size="lg" />
          <div className="min-w-0 flex-1 space-y-1.5 pe-8">
            <h2 className="break-words text-lg font-semibold text-text">{document.title}</h2>
            <p className="text-xs text-text-secondary">
              {t(KIND_LABELS[kind])} · {formatFileSize(document.byte_size, locale)}
              {document.page_count ? ` · ${t('drawer.pages_count', { count: document.page_count })}` : ''}
            </p>
            <LibraryStatusPill status={status} />
          </div>
        </div>

        <section aria-label={t('drawer.status')} className="space-y-3">
          {status === 'reading' ? (
            <>
              <p className="text-sm text-text-secondary">{t('status_help.reading')}</p>
              {readingText && progress ? (
                <div className="space-y-1">
                  <p className="text-xs text-text-secondary">{readingText}</p>
                  <SNProgressBar label={readingText} value={progress.current} max={progress.total} />
                </div>
              ) : null}
            </>
          ) : null}
          {status === 'ready' ? <p className="text-sm text-text-secondary">{t('status_help.ready')}</p> : null}
          {status === 'needs_look' || status === 'cant_read' ? (
            <SNBanner tone="warning" title={t(status === 'needs_look' ? 'status_help.needs_look_title' : 'status_help.cant_read_title')}>
              <div className="space-y-1.5">
                <p>{reason && reason in REASONS ? t(REASONS[reason]) : t(status === 'needs_look' ? 'status_help.needs_look' : 'status_help.cant_read')}</p>
                {flaggedPages.length > 0 ? <p>{t('status_help.pages', { pages: flaggedPages.map((page) => formatNumber(page, locale)).join(', ') })}</p> : null}
              </div>
            </SNBanner>
          ) : null}
          {document.status_detail?.personal_data_hint ? <SNBanner tone="info">{t('status_help.personal_data')}</SNBanner> : null}
          {document.acl_sync_pending ? <SNBanner tone="warning">{t('status_help.access_updating')}</SNBanner> : null}
          {canManage && (status === 'needs_look' || status === 'cant_read') ? (
            <div className="flex flex-wrap gap-2">
              <SNButton variant="primary" size="sm" disabled={pending} onClick={props.onReplace}>
                <FileUp aria-hidden="true" />
                {t('drawer.replace')}
              </SNButton>
              <SNButton size="sm" disabled={pending} onClick={props.onTryAgain}>
                <RotateCw aria-hidden="true" />
                {t('drawer.try_again')}
              </SNButton>
            </div>
          ) : null}
        </section>

        {status === 'ready' ? (
          <div className="flex flex-wrap gap-2">
            <SNButton asChild variant="primary">
              <Link href={`/w/${workspaceSlug}/new?${askParams.toString()}`}>
                <MessageCircle aria-hidden="true" />
                {t('drawer.ask')}
              </Link>
            </SNButton>
            <SNButton disabled={pending} onClick={props.onSeeText}>
              <Eye aria-hidden="true" />
              {t('drawer.see_text')}
            </SNButton>
          </div>
        ) : null}

        <div className="space-y-5">
          <SNField label={t('drawer.name')}>
            {canManage ? (
              <div className="flex gap-2">
                <SNInput value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
                {titleChanged ? (
                  <SNButton variant="primary" disabled={pending} onClick={() => props.onRename(title.trim())}>
                    {t('drawer.save_name')}
                  </SNButton>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text">{document.title}</p>
            )}
          </SNField>

          <SNField label={t('drawer.collection')}>
            {canManage ? (
              <SNSelect
                value={document.folder_id ?? TOP}
                disabled={pending}
                onValueChange={(value) => props.onMove(value === TOP ? null : value)}
                options={[
                  { value: TOP, label: t('collections.top') },
                  ...flat.map((node) => ({ value: node.id, label: `${' '.repeat(node.depth)}${node.name}` })),
                ]}
              />
            ) : (
              <p className="text-sm text-text">{collection?.name ?? t('collections.top')}</p>
            )}
          </SNField>

          <fieldset className="space-y-3">
            <legend className="text-[13px] font-medium text-text">{t('access.label')}</legend>
            {canManage ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <label htmlFor="library-same-access" className="block text-sm font-medium text-text">
                      {t('access.same')}
                    </label>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {document.access_inherited
                        ? collection
                          ? t(followed.everyone ? 'access.same_hint_everyone' : 'access.same_hint_chosen', { name: collection.name })
                          : t('access.same_hint_top')
                        : t('access.own_hint')}
                    </p>
                  </div>
                  <SNSwitch
                    id="library-same-access"
                    checked={document.access_inherited}
                    disabled={pending}
                    onCheckedChange={(checked) => {
                      // Turning it on goes back to the collection; turning it off keeps today's list as the file's own.
                      if (checked) props.onAccess('inherit');
                      else if (scopes) props.onAccess({ scopes });
                    }}
                  />
                </div>
                <LibraryAccessPicker
                  value={access}
                  specialists={specialists}
                  disabled={pending || document.access_inherited}
                  invalid={scopes === null}
                  onChange={setAccess}
                />
                {accessChanged && !document.access_inherited ? (
                  <SNButton
                    variant="primary"
                    size="sm"
                    disabled={pending || scopes === null}
                    onClick={() => {
                      if (scopes) props.onAccess({ scopes });
                    }}
                  >
                    {t('access.save')}
                  </SNButton>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text">{access.everyone ? t('used_by.everyone') : specialistNames.join(', ')}</p>
            )}
          </fieldset>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-text-secondary">{t('drawer.uploaded')}</dt>
            <dd className="text-text">
              {uploadedLine(props.uploadedBy, formatDate(document.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' }), t)}
            </dd>
            <dt className="text-text-secondary">{t('drawer.size')}</dt>
            <dd className="text-text">{formatFileSize(document.byte_size, locale)}</dd>
            {document.page_count ? (
              <>
                <dt className="text-text-secondary">{t('drawer.pages')}</dt>
                <dd className="text-text">{formatNumber(document.page_count, locale)}</dd>
              </>
            ) : null}
          </dl>
        </div>

        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}

        {canManage ? (
          <div className="border-t border-border pt-4">
            <SNButton variant="danger" size="sm" disabled={pending} onClick={props.onDelete}>
              <Trash2 aria-hidden="true" />
              {t('drawer.delete')}
            </SNButton>
          </div>
        ) : null}
      </div>
    </SNDrawer>
  );
}

function uploadedLine(name: string | null, when: string, t: ReturnType<typeof useTranslations>): string {
  return name ? t('drawer.uploaded_by', { name, date: when }) : when;
}
