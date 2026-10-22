import { notFound } from 'next/navigation';
import {
  getGetInboxCountsUseCase,
  getGetInboxItemUseCase,
  getListInboxUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { ListInboxQuerySchema } from '@/server/application/dtos/inbox_dto';
import { InboxScreen } from '@/client/components/inbox/inbox_screen';
import { defaultView, viewFromParam } from '@/client/components/inbox/inbox_model';
import { loadWorkspaceContext } from '../workspace_context';
import type { InboxListView } from '@/shared/inbox_view';

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<Query>;
}) {
  const { workspace_slug } = await params;
  const query = await searchParams;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const counts = await getGetInboxCountsUseCase().execute(context);
  const viewer = context.role === 'viewer';
  const asked = viewFromParam(first(query.tab));
  // A viewer has nothing that waits for them, so a link to Needs you opens their own default.
  const view = asked && !(viewer && asked === 'needs_you') ? asked : defaultView(counts, viewer);

  // Filters come from the address, so they are checked like any other input:
  // one that does not parse is dropped, not an error page for a mistyped link.
  const parsed = ListInboxQuerySchema.safeParse({
    tab: view,
    agent_slug: first(query.agent_slug),
    kind: first(query.kind),
    source_type: first(query.source_type),
    q: first(query.q),
    limit: 20,
  });
  const filters = parsed.success
    ? {
        agent_slug: parsed.data.agent_slug,
        kind: parsed.data.kind,
        source_type: parsed.data.source_type,
        q: parsed.data.q,
      }
    : {};

  // A list that cannot be loaded is shown as an error with a retry in the
  // screen, never as an empty Inbox. The counts above already proved the
  // database is reachable, so this is the list query itself failing.
  let list: InboxListView | null = null;
  let listError = false;
  try {
    list = await getListInboxUseCase().execute(
      {
        tab: view,
        limit: 20,
        ...(filters.agent_slug ? { agent_slug: filters.agent_slug } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.source_type ? { source_type: filters.source_type } : {}),
        ...(filters.q ? { q: filters.q } : {}),
      },
      context,
    );
  } catch {
    listError = true;
  }

  const itemId = first(query.item);
  const item = itemId
    ? await getGetInboxItemUseCase()
        .execute(itemId, context)
        .catch((error: unknown) => {
          if (error instanceof DomainError && error.status === 404) notFound();
          throw error;
        })
    : null;

  return (
    <InboxScreen
      // A different view or filter is a different list: start it clean. The
      // search text is left out on purpose, so typing is not interrupted.
      key={[view, filters.agent_slug, filters.kind, filters.source_type].join('|')}
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      currentUserId={context.user_id}
      view={view}
      counts={counts}
      list={list}
      listError={listError}
      selectedItem={item}
      readOnly={viewer}
      specialists={ctx.specialists}
      filters={filters}
      serverNow={new Date().toISOString()}
    />
  );
}
