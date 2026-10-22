import type { Metadata } from 'next';
import { LibraryScreen, type LibraryFilters } from '@/client/components/library/library_screen';
import {
  getGetLibraryDocumentUseCase,
  getGetLibrarySummaryUseCase,
  getGetLibraryUploaderNamesUseCase,
  getGetLibraryUsageUseCase,
  getListLibraryDocumentsUseCase,
  getListLibraryFoldersUseCase,
  getListSquadsUseCase,
} from '@/server/container';
import { getTranslations } from '@/i18n/server';
import { ListLibraryDocumentsQuerySchema } from '@/server/application/dtos/library_dto';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { toLibraryDocumentView, toLibraryFolderView } from '@/server/http/library_view';
import { loadWorkspaceContext } from '../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('library') };
}

/** A page of the list; "Show more" asks the API for the next ones. */
const PAGE_SIZE = 30;
const UI_STATUSES = new Set(['ready', 'reading', 'needs_attention', 'failed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace_slug } = await params;
  const raw = await searchParams;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);

  const strings = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
  // A hand-edited or stale link must not break the page: an invalid value
  // falls back to the unfiltered list instead of an error screen.
  const parsed = ListLibraryDocumentsQuerySchema.safeParse({ ...strings, limit: PAGE_SIZE });
  const query = parsed.success ? parsed.data : ListLibraryDocumentsQuerySchema.parse({ limit: PAGE_SIZE });
  // The page only offers the four filters it can draw; a raw `queued` in the URL would filter invisibly.
  const status = query.status && UI_STATUSES.has(query.status) ? query.status : undefined;

  const manager = context.role === 'owner' || context.role === 'admin';
  const [documents, folders, summary, usage, squads] = await Promise.all([
    getListLibraryDocumentsUseCase().execute({ ...query, status, cursor: undefined }, context),
    getListLibraryFoldersUseCase().execute(context),
    getGetLibrarySummaryUseCase().execute(context),
    manager ? getGetLibraryUsageUseCase().execute(context) : Promise.resolve(null),
    // Active squads for "Who can use this". A restricted member cannot pick one, so they get none.
    context.specialist_scope === 'selected'
      ? Promise.resolve({ items: [] })
      : getListSquadsUseCase().execute({ status: 'active' }, context),
  ]);

  let selected = null;
  const docId = strings.doc;
  if (docId && UUID.test(docId)) {
    try {
      selected = await getGetLibraryDocumentUseCase().execute(docId, context);
    } catch (error) {
      // A file that was deleted or is not visible to this member opens nothing.
      if (!(error instanceof NotFoundError)) throw error;
    }
  }

  const uploaderNames = await getGetLibraryUploaderNamesUseCase().execute(
    [...documents.items.map((item) => item.created_by), ...(selected ? [selected.created_by] : [])],
    context,
  );

  const specialists = ctx.specialists.filter(
    (s) => context.specialist_scope !== 'selected' || context.allowed_specialists?.includes(s.agent_slug),
  );
  const filters: LibraryFilters = {
    ...(query.folder_id ? { folderId: query.folder_id } : {}),
    q: query.q ?? '',
    status: (status ?? '') as LibraryFilters['status'],
    usedBy: query.used_by ?? '',
    everyoneOnly: query.scope_type === 'workspace' && !query.used_by,
    sort: query.sort ?? 'newest',
  };

  return (
    <LibraryScreen
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      list={{ items: documents.items.map(toLibraryDocumentView), next_cursor: documents.next_cursor }}
      folders={folders.items.map(toLibraryFolderView)}
      summary={summary}
      usage={usage}
      uploaderNames={uploaderNames}
      selectedDocument={selected ? toLibraryDocumentView(selected) : null}
      canUpload={context.role !== 'viewer'}
      canManage={manager}
      specialists={specialists}
      squads={squads.items.map(({ squad }) => ({ id: squad.id, name: squad.name }))}
      filters={filters}
    />
  );
}
