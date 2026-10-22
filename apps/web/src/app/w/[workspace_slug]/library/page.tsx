import { LibraryScreen } from '@/client/components/library/library_screen';
import {
  getGetLibraryUsageUseCase,
  getListLibraryDocumentsUseCase,
  getListLibraryFoldersUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { toLibraryDocumentView, toLibraryFolderView } from '@/server/http/library_view';
import { ListLibraryDocumentsQuerySchema } from '@/server/application/dtos/library_dto';
import { loadWorkspaceContext } from '../workspace_context';
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
  const query = ListLibraryDocumentsQuerySchema.parse(
    Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string')),
  );
  const manager = context.role === 'owner' || context.role === 'admin';
  const [documents, folders, usage] = await Promise.all([
    getListLibraryDocumentsUseCase().execute(query, context),
    getListLibraryFoldersUseCase().execute(context),
    manager ? getGetLibraryUsageUseCase().execute(context) : Promise.resolve(null),
  ]);
  const specialists = ctx.specialists.filter(
    (s) =>
      context.specialist_scope !== 'selected' ||
      context.allowed_specialists?.includes(s.agent_slug),
  );
  return (
    <LibraryScreen
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      list={{
        items: documents.items.map(toLibraryDocumentView),
        next_cursor: documents.next_cursor,
      }}
      folders={folders.items.map(toLibraryFolderView)}
      usage={usage}
      canUpload={context.role !== 'viewer'}
      canManage={manager}
      specialists={specialists}
      folderId={query.folder_id}
      search={query.q ?? ''}
      status={query.status ?? ''}
      scopeType={query.scope_type}
      scopeRef={query.scope_ref}
      sourceType={query.source_type}
      language={query.language}
    />
  );
}
