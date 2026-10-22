'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Link2, ListFilter, Plus, SearchX, StickyNote, Upload } from 'lucide-react';
import {
  SNBadge,
  SNButton,
  SNConfirmDialog,
  SNDialog,
  SNDrawer,
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuTrigger,
  SNDropzone,
  SNEmptyState,
  SNStatusChip,
  snToast,
} from '@sineva/ui';
import { formatFileSize, formatNumber } from '@sineva/ui/format';
import { apiRequest } from '@/client/lib/api';
import { uploadLibraryFile } from '@/client/lib/library_upload';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  LibraryDocumentListView,
  LibraryDocumentView,
  LibraryFolderView,
  LibraryPreviewView,
  LibrarySummaryView,
  LibraryUsageView,
} from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import {
  LibraryCollectionDialog,
  type CollectionDialogMode,
  type CollectionValues,
} from './library_collection_dialog';
import { LibraryCollections } from './library_collections';
import { LibraryDocumentDrawer } from './library_document_drawer';
import {
  LibraryDocumentList,
  LibraryToolbar,
  type LibraryView,
  type StatusFilter,
} from './library_documents';
import { LibraryHero } from './library_hero';
import {
  accessSummary,
  ancestorIds,
  buildCollectionTree,
  sameAccess,
  scopeInputs,
  type CollectionNode,
} from './library_model';
import { LibrarySquadsProvider, type LibrarySquadOption } from './library_squads';
import { LibraryUploadZone, MAX_FILES_PER_DROP } from './library_upload_zone';
import { useLibraryUploads } from './use_library_uploads';

/** Filters as the page read them from the URL. Everything here is a plain string so it round-trips. */
export interface LibraryFilters {
  folderId?: string;
  q: string;
  status: StatusFilter;
  /** `used_by` (a specialist slug), or '' */
  usedBy: string;
  /** `scope_type=workspace`: only files marked Everyone. */
  everyoneOnly: boolean;
  sort: string;
}

const VIEW_KEY = 'sineva.library.view';
const VIEW_EVENT = 'sineva:library-view';
const POLL_MS = 5000;
const PAGE_SIZE = 30;
const ACCEPTED = ['pdf', 'docx', 'xlsx', 'csv', 'pptx', 'txt', 'md', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_BYTES = 25 * 1024 * 1024;

function subscribeView(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(VIEW_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(VIEW_EVENT, onChange);
  };
}
function readView(): LibraryView {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    return stored === 'cards' ? 'cards' : 'list';
  } catch {
    // Storage can be blocked; the default view is fine.
    return 'list';
  }
}

/**
 * List or cards is a personal preference, not something to link, so it lives
 * in this browser only. An external store, not state plus an effect: the server
 * and the first paint show the list, and the saved choice takes over after.
 */
function useStoredView(): [LibraryView, (next: LibraryView) => void] {
  const view = React.useSyncExternalStore(subscribeView, readView, () => 'list' as const);
  const change = React.useCallback((next: LibraryView) => {
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered, still switched below.
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
  }, []);
  return [view, change];
}

type Deleting =
  | { kind: 'document'; document: LibraryDocumentView }
  | { kind: 'collection'; node: CollectionNode };

export function LibraryScreen({
  workspaceId,
  workspaceSlug,
  list,
  folders,
  summary,
  usage,
  uploaderNames,
  selectedDocument,
  canUpload,
  canManage,
  specialists,
  squads,
  filters,
}: {
  workspaceId: string;
  workspaceSlug: string;
  list: LibraryDocumentListView;
  folders: LibraryFolderView[];
  summary: LibrarySummaryView;
  /** Only for people who may see usage (owner and admin). */
  usage: LibraryUsageView | null;
  uploaderNames: Record<string, string>;
  /** The file named by `?doc=` when it is not on the loaded page. */
  selectedDocument: LibraryDocumentView | null;
  canUpload: boolean;
  canManage: boolean;
  specialists: ShellSpecialistView[];
  /** Active squads, for "Who can use this" (ADR-0043). */
  squads: LibrarySquadOption[];
  filters: LibraryFilters;
}) {
  const t = useTranslations('library_ui');
  const locale = useLocale();
  const router = useRouter();
  const errorText = useApiErrorText();
  const base = `/api/v1/workspaces/${workspaceId}/library`;
  const uploads = useLibraryUploads(workspaceId);
  const picker = React.useRef<HTMLInputElement>(null);

  // What is loaded: the server's page, plus whatever "Show more" appended. A
  // new page from the server (filter, search, refresh) replaces it, detected
  // by identity while rendering instead of an effect that would render twice.
  const [loaded, setLoaded] = React.useState({
    source: list,
    items: list.items,
    cursor: list.next_cursor,
  });
  if (loaded.source !== list)
    setLoaded({ source: list, items: list.items, cursor: list.next_cursor });
  const { items, cursor } = loaded;
  const [view, changeView] = useStoredView();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(selectedDocument?.id ?? null);
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  const [quotaOpen, setQuotaOpen] = React.useState(false);
  const [collectionDialog, setCollectionDialog] = React.useState<CollectionDialogMode | null>(null);
  const [deleting, setDeleting] = React.useState<Deleting | null>(null);
  const [replacing, setReplacing] = React.useState<LibraryDocumentView | null>(null);
  const [preview, setPreview] = React.useState<LibraryPreviewView | null>(null);
  const busy = React.useRef(false);

  // The file named in the URL opens the drawer (and a click opens it at once,
  // before the URL round trip); closing removes it from the URL.
  const urlDocId = selectedDocument?.id ?? null;
  const [seenDocId, setSeenDocId] = React.useState(urlDocId);
  if (seenDocId !== urlDocId) {
    setSeenDocId(urlDocId);
    setOpenId(urlDocId);
  }
  const openDocument =
    (openId
      ? (items.find((item) => item.id === openId) ??
        (selectedDocument?.id === openId ? selectedDocument : null))
      : null) ?? null;

  const tree = React.useMemo(
    () => buildCollectionTree(folders, summary.by_folder),
    [folders, summary.by_folder],
  );
  const collectionNames = React.useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );
  const selectedFolder =
    filters.folderId && filters.folderId !== 'root'
      ? folders.find((f) => f.id === filters.folderId)
      : undefined;

  // Reading goes on in the background; ask again while anything is unfinished
  // and the tab is visible. Stops by itself when nothing is left to read.
  const waiting = summary.by_status.reading > 0 || uploads.active;
  React.useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, router]);

  function query(overrides: Partial<Record<string, string | undefined>> = {}): URLSearchParams {
    const merged: Record<string, string | undefined> = {
      folder_id: filters.folderId,
      q: filters.q,
      status: filters.status,
      used_by: filters.usedBy,
      scope_type: filters.everyoneOnly ? 'workspace' : undefined,
      sort: filters.sort === 'newest' ? undefined : filters.sort,
      doc: openId ?? undefined,
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return params;
  }
  const href = (overrides?: Partial<Record<string, string | undefined>>) => {
    const qs = query(overrides).toString();
    return `/w/${workspaceSlug}/library${qs ? `?${qs}` : ''}`;
  };
  const hrefForFolder = (folderId: string | undefined) =>
    href({ folder_id: folderId, doc: undefined });

  function applyFilters(change: {
    q?: string;
    status?: StatusFilter;
    usedBy?: string;
    sort?: string;
  }) {
    const overrides: Record<string, string | undefined> = { doc: undefined };
    if (change.q !== undefined) overrides.q = change.q;
    if (change.status !== undefined) overrides.status = change.status;
    if (change.sort !== undefined)
      overrides.sort = change.sort === 'newest' ? undefined : change.sort;
    if (change.usedBy !== undefined) {
      overrides.used_by = change.usedBy && change.usedBy !== 'everyone' ? change.usedBy : undefined;
      overrides.scope_type = change.usedBy === 'everyone' ? 'workspace' : undefined;
    }
    router.replace(href(overrides), { scroll: false });
  }
  const clearFilters = () =>
    router.replace(
      href({
        q: undefined,
        status: undefined,
        used_by: undefined,
        scope_type: undefined,
        doc: undefined,
      }),
      { scroll: false },
    );

  function openFile(document: LibraryDocumentView) {
    setError(null);
    setOpenId(document.id);
    router.replace(href({ doc: document.id }), { scroll: false });
  }
  function closeFile() {
    setError(null);
    setOpenId(null);
    router.replace(href({ doc: undefined }), { scroll: false });
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function showMore() {
    if (!cursor) return;
    await run(async () => {
      const params = query({ doc: undefined });
      params.set('cursor', cursor);
      params.set('limit', String(PAGE_SIZE));
      const more = await apiRequest<LibraryDocumentListView>(
        `${base}/documents?${params.toString()}`,
      );
      setLoaded((current) => ({
        ...current,
        items: [
          ...current.items,
          ...more.items.filter(
            (item) => !current.items.some((existing) => existing.id === item.id),
          ),
        ],
        cursor: more.next_cursor,
      }));
    });
  }

  // --- adding files ------------------------------------------------------

  const intoFolder = selectedFolder?.id ?? null;
  function addFiles(files: File[]) {
    if (files.length > 0) uploads.add(files, intoFolder);
  }
  /** The Add menu and the empty state use a plain file input; the drop zone validates its own drops. */
  function onPicked(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    if (chosen.length === 0) return;
    if (chosen.length > MAX_FILES_PER_DROP) {
      snToast.error(t('zone.count_error'));
      return;
    }
    const valid = chosen.filter((file) => {
      const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
      return ACCEPTED.includes(ext) && file.size > 0 && file.size <= MAX_BYTES;
    });
    if (valid.length < chosen.length) {
      const typeProblem = chosen.some(
        (file) => !ACCEPTED.includes(file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()),
      );
      snToast.error(typeProblem ? t('zone.type_error') : t('zone.size_error'));
    }
    addFiles(valid);
  }
  const choose = () => picker.current?.click();

  // --- file actions ------------------------------------------------------

  const patchDocument = (
    document: LibraryDocumentView,
    body: Record<string, unknown>,
    done?: string,
  ) =>
    run(async () => {
      await apiRequest(`${base}/documents/${document.id}`, { method: 'PATCH', body });
      if (done) snToast.success(done);
    });

  async function seeText(document: LibraryDocumentView) {
    await run(async () => {
      setPreview(await apiRequest<LibraryPreviewView>(`${base}/documents/${document.id}/preview`));
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    const ok = await run(async () => {
      if (target.kind === 'document') {
        await apiRequest(`${base}/documents/${target.document.id}`, { method: 'DELETE' });
        snToast.success(t('toast.file_deleted'));
      } else {
        await apiRequest(`${base}/folders/${target.node.id}`, { method: 'DELETE' });
        snToast.success(t('toast.collection_deleted'));
      }
    });
    if (!ok) return;
    setDeleting(null);
    if (target.kind === 'document') closeFile();
    else if (filters.folderId === target.node.id)
      router.replace(hrefForFolder(undefined), { scroll: false });
  }

  async function submitCollection(values: CollectionValues) {
    const mode = collectionDialog;
    if (!mode) return;
    const ok = await run(async () => {
      if (mode.kind === 'create') {
        await apiRequest(`${base}/folders`, { method: 'POST', body: values });
        snToast.success(t('toast.collection_created'));
        return;
      }
      const body: Record<string, unknown> = {};
      if (values.name !== mode.node.name) body.name = values.name;
      if (values.parent_id !== mode.node.parent_id) body.parent_id = values.parent_id;
      const before = accessSummary(mode.node.scopes);
      const after = accessSummary(
        values.scopes.map((scope) => ({
          scope_type: scope.scope_type,
          scope_ref: scope.scope_type === 'workspace' ? null : scope.scope_ref,
        })),
      );
      if (!sameAccess(before, after)) {
        body.scopes = values.scopes;
      }
      if (Object.keys(body).length > 0)
        await apiRequest(`${base}/folders/${mode.node.id}`, { method: 'PATCH', body });
      snToast.success(t('toast.saved'));
    });
    if (ok) setCollectionDialog(null);
  }

  // --- states ------------------------------------------------------------

  const filtering = Boolean(filters.q || filters.status || filters.usedBy || filters.everyoneOnly);
  const usedByValue = filters.usedBy || (filters.everyoneOnly ? 'everyone' : '');
  const collectionsPanel = (onNavigate?: () => void) => (
    <LibraryCollections
      tree={tree}
      total={summary.total}
      inTop={summary.in_root}
      selected={filters.folderId}
      openIds={
        filters.folderId && filters.folderId !== 'root'
          ? ancestorIds(folders, filters.folderId)
          : []
      }
      hrefFor={hrefForFolder}
      canManage={canManage}
      onCreate={(parentId) => {
        setError(null);
        setCollectionDialog({ kind: 'create', parentId });
      }}
      onSettings={(node) => {
        setError(null);
        setCollectionDialog({ kind: 'edit', node });
      }}
      onDelete={(node) => {
        setError(null);
        setDeleting({ kind: 'collection', node });
      }}
      onNavigate={onNavigate}
    />
  );

  const addMenu = canUpload ? (
    <SNDropdownMenu>
      <SNDropdownMenuTrigger asChild>
        <SNButton variant="primary" size="lg">
          <Plus aria-hidden="true" />
          {t('add.menu')}
        </SNButton>
      </SNDropdownMenuTrigger>
      <SNDropdownMenuContent align="end" className="w-60">
        <SNDropdownMenuItem onSelect={choose}>
          <Upload aria-hidden="true" />
          {t('add.file')}
        </SNDropdownMenuItem>
        <SNDropdownMenuItem disabled>
          <Link2 aria-hidden="true" />
          <span className="flex-1">{t('add.link')}</span>
          <SNBadge tone="neutral">{t('soon')}</SNBadge>
        </SNDropdownMenuItem>
        <SNDropdownMenuItem disabled>
          <StickyNote aria-hidden="true" />
          <span className="flex-1">{t('add.note')}</span>
          <SNBadge tone="neutral">{t('soon')}</SNBadge>
        </SNDropdownMenuItem>
      </SNDropdownMenuContent>
    </SNDropdownMenu>
  ) : null;

  const emptyState = (() => {
    if (items.length > 0) return null;
    if (filters.q) {
      return (
        <SNEmptyState
          icon={SearchX}
          size="md"
          headingLevel={2}
          title={t('empty.search_title', { query: filters.q })}
          description={t('empty.search_body')}
          action={
            <SNButton onClick={() => applyFilters({ q: '' })}>{t('empty.search_action')}</SNButton>
          }
        />
      );
    }
    if (filtering) {
      return (
        <SNEmptyState
          icon={ListFilter}
          size="md"
          headingLevel={2}
          title={t('empty.filter_title')}
          description={t('empty.filter_body')}
          action={<SNButton onClick={clearFilters}>{t('empty.filter_action')}</SNButton>}
        />
      );
    }
    if (filters.folderId) {
      return (
        <SNEmptyState
          icon={FolderOpen}
          size="md"
          headingLevel={2}
          title={t('empty.collection_title')}
          description={canUpload ? t('empty.collection_body') : t('empty.collection_viewer_body')}
          action={
            canUpload ? (
              <SNButton variant="primary" onClick={choose}>
                {t('empty.upload')}
              </SNButton>
            ) : undefined
          }
        />
      );
    }
    return (
      <SNEmptyState
        pose="wave"
        size="lg"
        headingLevel={2}
        title={t('empty.library_title')}
        description={canUpload ? t('empty.library_body') : t('empty.library_viewer_body')}
        action={
          canUpload ? (
            <SNButton variant="primary" onClick={choose}>
              {t('empty.upload')}
            </SNButton>
          ) : undefined
        }
      />
    );
  })();

  return (
    <LibrarySquadsProvider value={squads}>
      <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          aria-label={t('add.file')}
          accept={ACCEPTED.map((ext) => `.${ext}`).join(',')}
          onChange={(event) => {
            onPicked(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
        <LibraryHero
          summary={summary}
          usage={usage}
          onStorageDetails={() => setQuotaOpen(true)}
          action={addMenu}
        />
        {canUpload ? (
          <LibraryUploadZone
            items={uploads.items}
            intoName={selectedFolder?.name ?? null}
            onFiles={addFiles}
            onRetry={uploads.retry}
            onRemove={uploads.remove}
          />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4">{collectionsPanel()}</div>
          </aside>
          <div className="min-w-0 space-y-4">
            <LibraryToolbar
              q={filters.q}
              status={filters.status}
              usedBy={usedByValue}
              sort={filters.sort}
              view={view}
              specialists={specialists}
              onChange={applyFilters}
              onView={changeView}
              onOpenCollections={() => setCollectionsOpen(true)}
            />
            {emptyState ?? (
              <>
                <LibraryDocumentList
                  items={items}
                  view={view}
                  collectionNames={collectionNames}
                  specialists={specialists}
                  selectedId={openId}
                  onOpen={openFile}
                />
                {cursor ? (
                  <div className="flex justify-center">
                    <SNButton loading={pending} onClick={() => void showMore()}>
                      {t('list.more')}
                    </SNButton>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {openDocument ? (
          <LibraryDocumentDrawer
            key={openDocument.id}
            document={openDocument}
            workspaceSlug={workspaceSlug}
            specialists={specialists}
            tree={tree}
            uploadedBy={uploaderNames[openDocument.created_by] ?? null}
            canManage={canManage}
            pending={pending}
            error={error}
            onClose={closeFile}
            onRename={(title) => void patchDocument(openDocument, { title }, t('toast.saved'))}
            onMove={(folderId) =>
              void patchDocument(openDocument, { folder_id: folderId }, t('toast.moved'))
            }
            onAccess={(change) =>
              void patchDocument(
                openDocument,
                change === 'inherit' ? { inherit_access: true } : { scopes: change.scopes },
                t('toast.access_saved'),
              )
            }
            onTryAgain={() =>
              void run(async () => {
                await apiRequest(`${base}/documents/${openDocument.id}/reindex`, {
                  method: 'POST',
                });
                snToast.success(t('toast.reading_again'));
              })
            }
            onReplace={() => {
              setError(null);
              setReplacing(openDocument);
            }}
            onSeeText={() => void seeText(openDocument)}
            onDelete={() => {
              setError(null);
              setDeleting({ kind: 'document', document: openDocument });
            }}
          />
        ) : null}

        <SNDrawer
          open={collectionsOpen}
          onOpenChange={setCollectionsOpen}
          side="start"
          width="panel"
          title={t('collections.title')}
          closeLabel={t('close')}
        >
          <div className="h-full overflow-y-auto p-5 pt-14 md:pt-5">
            {collectionsPanel(() => setCollectionsOpen(false))}
          </div>
        </SNDrawer>

        {collectionDialog ? (
          <LibraryCollectionDialog
            mode={collectionDialog}
            tree={tree}
            specialists={specialists}
            pending={pending}
            error={error}
            onSubmit={(values) => void submitCollection(values)}
            onClose={() => setCollectionDialog(null)}
          />
        ) : null}

        <SNConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setDeleting(null);
          }}
          title={
            deleting?.kind === 'collection' ? t('delete.collection_title') : t('delete.file_title')
          }
          description={
            deleting?.kind === 'collection'
              ? t('delete.collection_body', { name: deleting.node.name })
              : t('delete.file_body', { title: deleting?.document.title ?? '' })
          }
          confirmLabel={t('delete.confirm')}
          pendingLabel={t('delete.pending')}
          cancelLabel={t('cancel')}
          destructive
          pending={pending}
          error={error}
          onConfirm={() => void confirmDelete()}
        />

        {replacing ? (
          <ReplaceDialog
            document={replacing}
            workspaceId={workspaceId}
            onClose={() => setReplacing(null)}
            onReplaced={() => {
              setReplacing(null);
              closeFile();
              snToast.success(t('toast.replaced'));
              router.refresh();
            }}
          />
        ) : null}

        <SNDialog
          open={preview !== null}
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
          title={t('preview.title')}
          closeLabel={t('close')}
          footer={
            preview?.next_page ? (
              <SNButton
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const next = await apiRequest<LibraryPreviewView>(
                      `${base}/documents/${preview.document_id}/preview?page_from=${preview.next_page}`,
                    );
                    setPreview({ ...next, pages: [...preview.pages, ...next.pages] });
                  })
                }
              >
                {t('preview.more')}
              </SNButton>
            ) : undefined
          }
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {preview?.pages.map((page) => (
              <section key={page.page}>
                <h3 className="text-sm font-semibold text-text">
                  {t('preview.page', { number: page.page })}
                </h3>
                {page.readable ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text">{page.text}</p>
                ) : (
                  <p className="mt-1 text-sm text-warning">{t('preview.unreadable')}</p>
                )}
              </section>
            ))}
          </div>
        </SNDialog>

        <SNDrawer
          open={quotaOpen}
          onOpenChange={setQuotaOpen}
          side="end"
          width="panel"
          title={t('usage.title')}
          closeLabel={t('close')}
        >
          <div className="h-full space-y-5 overflow-y-auto p-5 pt-14 md:pt-5">
            <h2 className="text-lg font-semibold text-text">{t('usage.title')}</h2>
            {usage ? (
              <ul className="space-y-3">
                <UsageRow
                  label={t('usage.files')}
                  value={formatNumber(usage.documents, locale)}
                  ok={usage.within_limits.documents}
                  warning={t('usage.files_reached')}
                />
                <UsageRow
                  label={t('usage.storage')}
                  value={formatFileSize(usage.storage_bytes, locale)}
                  ok={usage.within_limits.storage}
                  warning={t('usage.storage_reached')}
                />
                <UsageRow
                  label={t('usage.pages')}
                  value={formatNumber(usage.ocr_pages_month, locale)}
                  ok={usage.within_limits.ocr_pages}
                  warning={t('usage.pages_reached')}
                />
              </ul>
            ) : null}
          </div>
        </SNDrawer>
      </section>
    </LibrarySquadsProvider>
  );
}

function UsageRow({
  label,
  value,
  ok,
  warning,
}: {
  label: string;
  value: string;
  ok: boolean;
  warning: string;
}) {
  const t = useTranslations('library_ui');
  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text">{label}</span>
        <SNStatusChip
          tone={ok ? 'success' : 'danger'}
          label={ok ? t('usage.ok') : t('usage.reached')}
        />
      </div>
      <p className="text-2xl font-semibold text-text">{value}</p>
      {ok ? null : <p className="text-sm text-warning">{warning}</p>}
    </li>
  );
}

/**
 * Replace a file: the new one takes the old one's collection and access, and
 * the old one is deleted once the new one is received. Not atomic by design
 * (ADR-0033): if the delete fails the new file is already in, and the message
 * says so; nothing is lost.
 */
function ReplaceDialog({
  document,
  workspaceId,
  onClose,
  onReplaced,
}: {
  document: LibraryDocumentView;
  workspaceId: string;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const t = useTranslations('library_ui');
  const errorText = useApiErrorText();
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function replaceWith(file: File) {
    setWorking(true);
    setError(null);
    try {
      // Sending no scopes keeps a file that follows its collection following it.
      const scopes = document.access_inherited ? null : scopeInputs(accessSummary(document.scopes));
      await uploadLibraryFile(
        workspaceId,
        file,
        { folder_id: document.folder_id, ...(scopes ? { scopes } : {}) },
        {},
      );
    } catch (err) {
      setError(errorText(err));
      setWorking(false);
      return;
    }
    try {
      await apiRequest(`/api/v1/workspaces/${workspaceId}/library/documents/${document.id}`, {
        method: 'DELETE',
      });
    } catch {
      setError(t('replace.delete_failed'));
      setWorking(false);
      return;
    }
    onReplaced();
  }

  return (
    <SNDialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
      title={t('replace.title')}
      description={t('replace.body')}
      closeLabel={t('close')}
      footer={
        <SNButton disabled={working} onClick={onClose}>
          {t('cancel')}
        </SNButton>
      }
    >
      <div className="space-y-3">
        <SNDropzone
          label={t('replace.label')}
          hint={t('replace.hint')}
          accept={ACCEPTED.map((ext) => `.${ext}`).join(',')}
          maxBytes={MAX_BYTES}
          disabled={working}
          onFilesChange={(files) => {
            const [file] = files;
            if (file) void replaceWith(file);
          }}
          messages={{
            type: t('zone.type_error'),
            size: t('zone.size_error'),
            count: t('zone.count_error'),
          }}
        />
        {working ? (
          <p role="status" className="text-sm text-text-secondary">
            {t('replace.working')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </SNDialog>
  );
}
