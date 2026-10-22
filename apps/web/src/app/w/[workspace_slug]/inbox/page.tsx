import { notFound } from 'next/navigation';
import {
  getGetInboxCountsUseCase,
  getGetInboxItemUseCase,
  getListInboxUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { InboxScreen } from '@/client/components/inbox/inbox_screen';
import { loadWorkspaceContext } from '../workspace_context';
import type { InboxTabView } from '@/shared/inbox_view';

const tabs = {
  needs_review: 'views.needs_review',
  needs_input: 'views.needs_input',
  done: 'views.done',
} as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{
    tab?: string;
    item?: string;
    cursor?: string;
    agent_slug?: string;
    source_type?: string;
  }>;
}) {
  const { workspace_slug } = await params;
  const query = await searchParams;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const counts = await getGetInboxCountsUseCase().execute(context);
  const tab: InboxTabView =
    query.tab && Object.hasOwn(tabs, query.tab)
      ? (query.tab as InboxTabView)
      : context.role === 'viewer'
        ? 'done'
        : counts.needs_review > 0
          ? 'needs_review'
          : counts.needs_input > 0
            ? 'needs_input'
            : 'done';
  const list = await getListInboxUseCase().execute(
    { tab, limit: 20, cursor: query.cursor?.slice(0, 300), agent_slug: query.agent_slug },
    context,
  );
  const item = query.item
    ? await getGetInboxItemUseCase()
        .execute(query.item, context)
        .catch((error: unknown) => {
          if (error instanceof DomainError && error.status === 404) notFound();
          throw error;
        })
    : null;

  return (
    <InboxScreen
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      tab={tab}
      counts={counts}
      list={list}
      selectedItem={item}
      readOnly={context.role === 'viewer'}
      specialists={ctx.specialists}
      selectedSpecialist={query.agent_slug}
      selectedSource={query.source_type}
      cursor={query.cursor?.slice(0, 300)}
    />
  );
}
