'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  SNBanner,
  SNButton,
  SNConfirmDialog,
  SNDialog,
  SNDrawer,
  SNDropzone,
  SNField,
  SNInput,
  SNProgressBar,
  SNSelect,
  SNStatusChip,
  SNTextarea,
} from '@sineva/ui';
import { formatNumber, formatDate } from '@sineva/ui/format';
import { apiRequest } from '@/client/lib/api';
import { uploadLibraryFile, type LibraryUploadSession } from '@/client/lib/library_upload';
import { LibraryUploadQueue, type LibraryUploadState } from './library_upload_queue';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  LibraryDocumentListView,
  LibraryDocumentView,
  LibraryFolderView,
  LibraryPreviewView,
  LibraryTryResultView,
  LibraryUsageView,
} from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';

const statuses = {
  queued: 'statuses.queued',
  processing: 'statuses.processing',
  ready: 'statuses.ready',
  needs_attention: 'statuses.needs_attention',
  failed: 'statuses.failed',
  deleting: 'statuses.deleting',
} as const;

const reasonCodes = {
  password_protected: 'reason_codes.password_protected',
  unreadable_pages: 'reason_codes.unreadable_pages',
  no_text_found: 'reason_codes.no_text_found',
  hidden_text_detected: 'reason_codes.hidden_text_detected',
  unsupported_content: 'reason_codes.unsupported_content',
  parse_failed: 'reason_codes.parse_failed',
  ocr_failed: 'reason_codes.ocr_failed',
  embedding_failed: 'reason_codes.embedding_failed',
  too_many_pages: 'reason_codes.too_many_pages',
  storage_object_missing: 'reason_codes.storage_object_missing',
  ingest_service_unavailable: 'reason_codes.ingest_service_unavailable',
  ingest_service_error: 'reason_codes.ingest_service_error',
} as const;

export function LibraryScreen({
  workspaceId,
  workspaceSlug,
  list,
  folders,
  usage,
  canUpload,
  canManage,
  specialists,
  folderId,
  search,
  status,
  scopeType = '',
  scopeRef = '',
  sourceType = '',
  language = '',
}: {
  workspaceId: string;
  workspaceSlug: string;
  list: LibraryDocumentListView;
  folders: LibraryFolderView[];
  usage: LibraryUsageView | null;
  canUpload: boolean;
  canManage: boolean;
  specialists: ShellSpecialistView[];
  folderId?: string;
  search: string;
  status: string;
  scopeType?: string;
  scopeRef?: string;
  sourceType?: string;
  language?: string;
}) {
  const t = useTranslations('library_ui');
  const locale = useLocale();
  const router = useRouter();
  const errorText = useApiErrorText();
  const base = `/api/v1/workspaces/${workspaceId}/library`;
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<'upload' | 'note' | 'folder' | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploadStates, setUploadStates] = React.useState<Map<File, LibraryUploadState>>(new Map());
  const busy = React.useRef(false);
  const uploadSessions = React.useRef(new Map<File, LibraryUploadSession>());
  const [scope, setScope] = React.useState('workspace');
  const [editing, setEditing] = React.useState<LibraryDocumentView | null>(null);
  const [deleting, setDeleting] = React.useState<{ path: string; title: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = React.useState<{ id: string; name: string } | null>(
    null,
  );
  const [movingFolder, setMovingFolder] = React.useState<{
    id: string;
    parent_id: string | null;
  } | null>(null);
  const [moveParentId, setMoveParentId] = React.useState('');
  const [quotaOpen, setQuotaOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<LibraryPreviewView | null>(null);
  const [retrieval, setRetrieval] = React.useState<LibraryTryResultView | null>(null);

  const url = (values: Record<string, string>) =>
    `/w/${workspaceSlug}/library?${new URLSearchParams({
      ...(folderId ? { folder_id: folderId } : {}),
      ...(search ? { q: search } : {}),
      ...(status ? { status } : {}),
      ...(scopeType ? { scope_type: scopeType } : {}),
      ...(scopeRef ? { scope_ref: scopeRef } : {}),
      ...(sourceType ? { source_type: sourceType } : {}),
      ...(language ? { language } : {}),
      ...values,
    })}`;

  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const scopeOptions = [
    { value: 'workspace', label: t('workspace_scope') },
    ...specialists.map((s) => ({ value: s.agent_slug, label: s.display_name })),
  ];

  const scopes = () =>
    scope === 'workspace'
      ? [{ scope_type: 'workspace' as const }]
      : [{ scope_type: 'specialist' as const, scope_ref: scope }];

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const targetFolder = folderId && folderId !== 'root' ? folderId : null;
      if (dialog === 'upload') {
        if (!files.length) return;
        let failed = false;
        for (const file of files) {
          if (uploadStates.get(file)?.status === 'queued') continue;
          setUploadStates((states) => new Map(states).set(file, { status: 'uploading' }));
          try {
            const session = uploadSessions.current.get(file) ?? {};
            uploadSessions.current.set(file, session);
            await uploadLibraryFile(
              workspaceId,
              file,
              {
                folder_id: targetFolder,
                scopes: scopes(),
              },
              session,
            );
            setUploadStates((states) => new Map(states).set(file, { status: 'queued' }));
          } catch (err) {
            failed = true;
            setUploadStates((states) =>
              new Map(states).set(file, { status: 'failed', error: errorText(err) }),
            );
          }
        }
        if (failed) return;
      } else if (dialog === 'note') {
        await apiRequest(`${base}/documents`, {
          method: 'POST',
          body: {
            source_type: 'note',
            title: form.get('title'),
            content: form.get('content'),
            folder_id: targetFolder,
            scopes: scopes(),
          },
        });
      } else {
        await apiRequest(`${base}/folders`, {
          method: 'POST',
          body: { name: form.get('title'), parent_id: targetFolder },
        });
      }
      setDialog(null);
    });
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 p-5 sm:p-8">
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-2 text-sm text-text-secondary">{t('description')}</p>
        </div>
        {canUpload ? (
          <div className="flex flex-wrap gap-2">
            <SNButton
              variant="primary"
              onClick={() => {
                setError(null);
                setFiles([]);
                setUploadStates(new Map());
                uploadSessions.current.clear();
                setDialog('upload');
              }}
            >
              {t('upload')}
            </SNButton>
            <SNButton
              onClick={() => {
                setError(null);
                setDialog('note');
              }}
            >
              {t('add_note')}
            </SNButton>
            {canManage ? (
              <SNButton onClick={() => setDialog('folder')}>{t('new_folder')}</SNButton>
            ) : null}
          </div>
        ) : null}
      </header>
      {error && !dialog && !editing ? <SNBanner tone="danger">{error}</SNBanner> : null}
      {usage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
          <p>
            {t('usage', {
              documents: formatNumber(usage.documents, locale),
              bytes: formatNumber(usage.storage_bytes, locale),
              pages: formatNumber(usage.ocr_pages_month, locale),
            })}
          </p>
          <SNButton size="sm" variant="ghost" onClick={() => setQuotaOpen(true)}>
            {t('usage_action')}
          </SNButton>
        </div>
      ) : null}
      <form action={`/w/${workspaceSlug}/library`} className="flex flex-wrap items-end gap-3">
        <SNField label={t('search')}>
          <SNInput name="q" defaultValue={search} maxLength={100} />
        </SNField>
        {folderId ? <input type="hidden" name="folder_id" value={folderId} /> : null}
        <SNField label={t('status')}>
          <SNSelect
            name="status"
            value={status}
            onValueChange={(value) => router.push(url({ status: value }))}
            options={[
              { value: '', label: t('all_statuses') },
              ...Object.entries(statuses).map(([value, key]) => ({ value, label: t(key) })),
            ]}
          />
        </SNField>
        <SNField label={t('scope_filter')}>
          <SNSelect
            name="scope_filter"
            value={scopeType === 'specialist' ? scopeRef : scopeType}
            onValueChange={(value) => {
              if (!value) router.push(url({ scope_type: '', scope_ref: '' }));
              else if (value === 'workspace')
                router.push(url({ scope_type: 'workspace', scope_ref: '' }));
              else router.push(url({ scope_type: 'specialist', scope_ref: value }));
            }}
            options={[
              { value: '', label: t('all_scopes') },
              { value: 'workspace', label: t('workspace_scope') },
              ...specialists.map((s) => ({ value: s.agent_slug, label: s.display_name })),
            ]}
          />
        </SNField>
        <SNField label={t('source_type')}>
          <SNSelect
            name="source_type"
            value={sourceType}
            onValueChange={(value) => router.push(url({ source_type: value }))}
            options={[
              { value: '', label: t('all_sources') },
              { value: 'upload', label: t('source_upload') },
              { value: 'note', label: t('source_note') },
              { value: 'chat_save', label: t('source_chat_save') },
            ]}
          />
        </SNField>
        <SNField label={t('language')}>
          <SNSelect
            name="language"
            value={language}
            onValueChange={(value) => router.push(url({ language: value }))}
            options={[
              { value: '', label: t('all_languages') },
              { value: 'id', label: t('lang_id') },
              { value: 'en', label: t('lang_en') },
              { value: 'mixed', label: t('lang_mixed') },
            ]}
          />
        </SNField>
        <SNButton type="submit">{t('search')}</SNButton>
        <SNButton disabled={pending} onClick={() => router.refresh()}>
          {t('refresh')}
        </SNButton>
      </form>
      <nav aria-label={t('folders')} className="flex flex-wrap gap-2">
        <SNButton asChild size="sm">
          <Link href={`/w/${workspaceSlug}/library`}>{t('all_documents')}</Link>
        </SNButton>
        <SNButton asChild size="sm">
          <Link href={url({ folder_id: 'root' })}>{t('root')}</Link>
        </SNButton>
        {folders.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1">
            <SNButton asChild size="sm" variant={folder.id === folderId ? 'primary' : 'secondary'}>
              <Link href={url({ folder_id: folder.id })}>{folder.name}</Link>
            </SNButton>
            {canManage && folder.id === folderId ? (
              <>
                <SNButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setRenamingFolder({ id: folder.id, name: folder.name })}
                >
                  {t('rename')}
                </SNButton>
                <SNButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMovingFolder({ id: folder.id, parent_id: folder.parent_id });
                    setMoveParentId(folder.parent_id ?? '');
                  }}
                >
                  {t('move')}
                </SNButton>
                <SNButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting({ path: `folders/${folder.id}`, title: folder.name })}
                >
                  {t('delete')}
                </SNButton>
              </>
            ) : null}
          </span>
        ))}
      </nav>
      {list.items.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-sm text-text-secondary">
          {t('empty')}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.items.map((document) => (
            <li key={document.id} className="space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="break-words font-medium">{document.title}</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t(statuses[document.status])} · {formatDate(document.created_at, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {document.status === 'ready' ? (
                    <SNButton
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          setPreview(
                            await apiRequest<LibraryPreviewView>(
                              `${base}/documents/${document.id}/preview`,
                            ),
                          );
                        })
                      }
                    >
                      {t('preview')}
                    </SNButton>
                  ) : null}
                  {canManage ? (
                    <>
                      <SNButton size="sm" disabled={pending} onClick={() => setEditing(document)}>
                        {t('edit')}
                      </SNButton>
                      <SNButton
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            await apiRequest(`${base}/documents/${document.id}/reindex`, {
                              method: 'POST',
                            });
                          })
                        }
                      >
                        {t('retry')}
                      </SNButton>
                      <SNButton
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          setDeleting({ path: `documents/${document.id}`, title: document.title })
                        }
                      >
                        {t('delete')}
                      </SNButton>
                    </>
                  ) : null}
                </div>
              </div>
              {document.status === 'queued' ? (
                <p className="text-sm text-text-secondary">{t('queued_hint')}</p>
              ) : null}
              {document.status === 'processing' && document.status_detail?.progress ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-text-secondary">
                    {t('reading_progress', {
                      current: document.status_detail.progress.current,
                      total: document.status_detail.progress.total,
                    })}
                  </p>
                  <SNProgressBar
                    label={t('reading_progress', {
                      current: document.status_detail.progress.current,
                      total: document.status_detail.progress.total,
                    })}
                    value={document.status_detail.progress.current}
                    max={document.status_detail.progress.total}
                  />
                </div>
              ) : null}
              {document.status === 'needs_attention' || document.status === 'failed' ? (
                <div className="space-y-1.5">
                  <SNBanner tone="warning">
                    {document.status_detail?.reason_code &&
                    document.status_detail.reason_code in reasonCodes
                      ? t(
                          reasonCodes[
                            document.status_detail.reason_code as keyof typeof reasonCodes
                          ],
                        )
                      : t('attention_hint')}
                  </SNBanner>
                  {document.status_detail?.pages && document.status_detail.pages.length > 0 ? (
                    <p className="text-xs text-text-secondary">
                      {t('flagged_pages', { pages: document.status_detail.pages.join(', ') })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {document.acl_sync_pending ? (
                <SNBanner tone="warning">{t('scope_pending')}</SNBanner>
              ) : null}
              {document.status_detail?.personal_data_hint ? (
                <SNBanner tone="warning">{t('personal_data')}</SNBanner>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {list.next_cursor ? (
        <SNButton asChild>
          <Link href={url({ cursor: list.next_cursor })}>{t('next')}</Link>
        </SNButton>
      ) : null}
      {canManage ? (
        <section className="space-y-4 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">{t('try_title')}</h2>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                setRetrieval(
                  await apiRequest<LibraryTryResultView>(`${base}/try`, {
                    method: 'POST',
                    body: {
                      query: form.get('query'),
                      ...(scope !== 'workspace' ? { agent_slug: scope } : {}),
                    },
                  }),
                );
              });
            }}
          >
            <SNField label={t('question')} required>
              <SNInput name="query" maxLength={500} required />
            </SNField>
            <SNField label={t('scope')}>
              <SNSelect value={scope} onValueChange={setScope} options={scopeOptions} />
            </SNField>
            <SNButton type="submit" loading={pending}>
              {t('try_search')}
            </SNButton>
          </form>
          {retrieval ? (
            retrieval.abstained ? (
              <SNBanner>{t('abstained')}</SNBanner>
            ) : (
              <ul className="space-y-3">
                {retrieval.results.map((result) => (
                  <li key={result.chunk_id} className="rounded-md border border-border p-3">
                    <p className="font-medium">{result.title}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{result.snippet}</p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      ) : null}
      <SNDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDialog(null);
        }}
        title={
          dialog === 'folder' ? t('new_folder') : dialog === 'note' ? t('add_note') : t('upload')
        }
      >
        <form onSubmit={create} className="space-y-4">
          {dialog === 'upload' ? (
            <SNField label={t('file')} required>
              <SNDropzone
                label={t('dropzone_label')}
                hint={t('file_hint')}
                multiple
                maxFiles={10}
                onFilesChange={(incoming) => {
                  const next = [...files];
                  for (const file of incoming) {
                    if (
                      !next.some(
                        (existing) =>
                          existing.name === file.name &&
                          existing.size === file.size &&
                          existing.lastModified === file.lastModified,
                      )
                    )
                      next.push(file);
                  }
                  if (next.length > 10) {
                    setError(t('file_count_error'));
                    return;
                  }
                  setError(null);
                  setFiles(next);
                }}
                disabled={pending}
                accept=".pdf,.docx,.xlsx,.csv,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp"
                maxBytes={25 * 1024 * 1024}
                messages={{
                  type: t('file_type_error'),
                  size: t('file_size_error'),
                  count: t('file_count_error'),
                }}
              />
              <LibraryUploadQueue
                files={files}
                states={uploadStates}
                pending={pending}
                onRemove={(file) => {
                  uploadSessions.current.delete(file);
                  setFiles((selected) => selected.filter((entry) => entry !== file));
                  setUploadStates((states) => {
                    const next = new Map(states);
                    next.delete(file);
                    return next;
                  });
                }}
              />
            </SNField>
          ) : (
            <SNField label={t('name')} required>
              <SNInput name="title" maxLength={dialog === 'folder' ? 80 : 200} required />
            </SNField>
          )}
          {dialog === 'note' ? (
            <SNField label={t('note')} required>
              <SNTextarea name="content" rows={8} maxLength={100000} required />
            </SNField>
          ) : null}
          {dialog !== 'folder' ? (
            <SNField label={t('scope')}>
              <SNSelect
                value={scope}
                onValueChange={setScope}
                options={scopeOptions}
                disabled={pending || (dialog === 'upload' && uploadStates.size > 0)}
              />
            </SNField>
          ) : null}
          {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
          <div className="flex gap-2">
            <SNButton
              type="submit"
              variant="primary"
              loading={pending}
              disabled={dialog === 'upload' && files.length === 0}
            >
              {dialog === 'upload' &&
              [...uploadStates.values()].some((state) => state.status === 'failed')
                ? t('retry_uploads')
                : t('save')}
            </SNButton>
            <SNButton disabled={pending} onClick={() => setDialog(null)}>
              {t('cancel')}
            </SNButton>
          </div>
        </form>
      </SNDialog>
      {editing ? (
        <DocumentEditor
          key={editing.id}
          document={editing}
          folders={folders}
          scopeOptions={scopeOptions}
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setEditing(null);
          }}
          onSave={(body) =>
            run(async () => {
              await apiRequest(`${base}/documents/${editing.id}`, { method: 'PATCH', body });
              setEditing(null);
            })
          }
        />
      ) : null}
      <SNConfirmDialog
        error={error}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null);
        }}
        title={t('delete_title')}
        description={t('delete_body', { title: deleting?.title ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={() => {
          if (deleting)
            void run(async () => {
              await apiRequest(`${base}/${deleting.path}`, { method: 'DELETE' });
              setDeleting(null);
            });
        }}
      />
      <SNDialog
        open={renamingFolder !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRenamingFolder(null);
        }}
        title={t('rename_folder')}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const name = String(form.get('name') ?? '').trim();
            if (!name || !renamingFolder) return;
            void run(async () => {
              await apiRequest(`${base}/folders/${renamingFolder.id}`, {
                method: 'PATCH',
                body: { name },
              });
              setRenamingFolder(null);
            });
          }}
        >
          <SNField label={t('folder_name')} required>
            <SNInput
              name="name"
              defaultValue={renamingFolder?.name ?? ''}
              maxLength={80}
              required
            />
          </SNField>
          {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
          <div className="flex gap-2">
            <SNButton type="submit" variant="primary" loading={pending}>
              {t('save')}
            </SNButton>
            <SNButton disabled={pending} onClick={() => setRenamingFolder(null)}>
              {t('cancel')}
            </SNButton>
          </div>
        </form>
      </SNDialog>
      <SNDialog
        open={movingFolder !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setMovingFolder(null);
        }}
        title={t('move_folder')}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!movingFolder) return;
            void run(async () => {
              await apiRequest(`${base}/folders/${movingFolder.id}`, {
                method: 'PATCH',
                body: {
                  parent_id: moveParentId && moveParentId !== 'root' ? moveParentId : null,
                },
              });
              setMovingFolder(null);
            });
          }}
        >
          <SNField label={t('destination_folder')}>
            <SNSelect
              name="parent_id"
              value={moveParentId}
              onValueChange={setMoveParentId}
              options={[
                { value: '', label: t('root') },
                ...folders
                  .filter((f) => f.id !== movingFolder?.id)
                  .map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </SNField>
          {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
          <div className="flex gap-2">
            <SNButton type="submit" variant="primary" loading={pending}>
              {t('save')}
            </SNButton>
            <SNButton disabled={pending} onClick={() => setMovingFolder(null)}>
              {t('cancel')}
            </SNButton>
          </div>
        </form>
      </SNDialog>
      <SNDrawer
        open={quotaOpen}
        onOpenChange={setQuotaOpen}
        title={t('quota_title')}
        closeLabel={t('close')}
      >
        <div className="space-y-6 p-6">
          <h2 className="text-xl font-semibold text-text">{t('quota_title')}</h2>
          {usage ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{t('quota_documents')}</span>
                  <SNStatusChip
                    tone={usage.within_limits.documents ? 'success' : 'danger'}
                    label={usage.within_limits.documents ? t('limit_ok') : t('limit_reached')}
                  />
                </div>
                <p className="text-2xl font-semibold text-text">
                  {formatNumber(usage.documents, locale)}
                </p>
                {!usage.within_limits.documents ? (
                  <SNBanner tone="warning">{t('documents_limit_reached')}</SNBanner>
                ) : null}
              </div>

              <div className="space-y-2 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{t('quota_storage')}</span>
                  <SNStatusChip
                    tone={usage.within_limits.storage ? 'success' : 'danger'}
                    label={usage.within_limits.storage ? t('limit_ok') : t('limit_reached')}
                  />
                </div>
                <p className="text-2xl font-semibold text-text">
                  {t('storage_bytes_count', {
                    bytes: formatNumber(usage.storage_bytes, locale),
                  })}
                </p>
                {!usage.within_limits.storage ? (
                  <SNBanner tone="warning">{t('storage_limit_reached')}</SNBanner>
                ) : null}
              </div>

              <div className="space-y-2 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{t('quota_ocr')}</span>
                  <SNStatusChip
                    tone={usage.within_limits.ocr_pages ? 'success' : 'danger'}
                    label={usage.within_limits.ocr_pages ? t('limit_ok') : t('limit_reached')}
                  />
                </div>
                <p className="text-2xl font-semibold text-text">
                  {t('pages_count', {
                    pages: formatNumber(usage.ocr_pages_month, locale),
                  })}
                </p>
                {!usage.within_limits.ocr_pages ? (
                  <SNBanner tone="warning">{t('ocr_limit_reached')}</SNBanner>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SNDrawer>
      <SNDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        title={t('preview')}
        closeLabel={t('close')}
      >
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {preview?.pages.map((page) => (
            <section key={page.page}>
              <h3 className="text-sm font-semibold">{t('page', { number: page.page })}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{page.text}</p>
            </section>
          ))}
          {preview?.next_page ? (
            <SNButton
              disabled={pending}
              onClick={() =>
                run(async () => {
                  setPreview(
                    await apiRequest<LibraryPreviewView>(
                      `${base}/documents/${preview.document_id}/preview?page_from=${preview.next_page}`,
                    ),
                  );
                })
              }
            >
              {t('next')}
            </SNButton>
          ) : null}
        </div>
      </SNDialog>
    </section>
  );
}

function DocumentEditor({
  document,
  folders,
  scopeOptions,
  pending,
  error,
  onSave,
  onClose,
}: {
  document: LibraryDocumentView;
  folders: LibraryFolderView[];
  scopeOptions: Array<{ value: string; label: string }>;
  pending: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const t = useTranslations('library_ui');
  const [folder, setFolder] = React.useState(document.folder_id ?? '');
  const [scope, setScope] = React.useState(
    document.scopes.find((s) => s.scope_type === 'specialist')?.scope_ref ?? 'workspace',
  );
  return (
    <SNDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('edit')}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const days = String(form.get('review') ?? '');
          onSave({
            title: form.get('title'),
            folder_id: folder || null,
            ...(scope !==
            (document.scopes.find((s) => s.scope_type === 'specialist')?.scope_ref ?? 'workspace')
              ? {
                  scopes:
                    scope === 'workspace'
                      ? [{ scope_type: 'workspace' }]
                      : [{ scope_type: 'specialist', scope_ref: scope }],
                }
              : {}),
            review_interval_days: days ? Number(days) : null,
          });
        }}
      >
        <SNField label={t('name')} required>
          <SNInput name="title" defaultValue={document.title} maxLength={200} required />
        </SNField>
        <SNField label={t('folders')}>
          <SNSelect
            value={folder}
            onValueChange={setFolder}
            options={[
              { value: '', label: t('root') },
              ...folders.map((f) => ({ value: f.id, label: f.name })),
            ]}
          />
        </SNField>
        <SNField label={t('scope')}>
          <SNSelect value={scope} onValueChange={setScope} options={scopeOptions} />
        </SNField>
        <SNField label={t('review_days')}>
          <SNInput
            name="review"
            type="number"
            min={1}
            max={730}
            defaultValue={document.review_interval_days ?? ''}
          />
        </SNField>
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        <div className="flex gap-2">
          <SNButton type="submit" variant="primary" loading={pending}>
            {t('save')}
          </SNButton>
          <SNButton disabled={pending} onClick={onClose}>
            {t('cancel')}
          </SNButton>
        </div>
      </form>
    </SNDialog>
  );
}
