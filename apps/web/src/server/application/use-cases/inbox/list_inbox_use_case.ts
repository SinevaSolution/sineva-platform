import type { RequestContext } from '@/server/domain/context/request_context';
import type { InboxItemKind, InboxListTab, InboxSourceType } from '@/server/domain/inbox/inbox_item';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { InboxListView } from '@/shared/inbox_view';
import { buildItemView } from './inbox_view_builder';
import { scopeOf, workspaceOf } from './inbox_access';

export interface ListInboxInput {
  tab?: InboxListTab;
  agent_slug?: string;
  kind?: InboxItemKind;
  source_type?: InboxSourceType;
  q?: string;
  cursor?: string | null;
  limit: number;
}

/** GET .../inbox. Role scope is applied in the query, so a member never receives another person's row. */
export class ListInboxUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(input: ListInboxInput, context: RequestContext): Promise<InboxListView> {
    const workspaceId = workspaceOf(context);
    const scope = scopeOf(context);

    // A viewer sees summaries of what is finished (Updates and Done). A tab
    // that needs a person is empty, not an error, so a UI that renders all
    // tabs needs no special case. With no tab named the viewer gets both
    // finished tabs, never an open item.
    const viewerTabs: readonly string[] = ['updates', 'done'];
    if (scope.kind === 'done_only' && input.tab && !viewerTabs.includes(input.tab)) {
      return { items: [], next_cursor: null };
    }
    const tab = scope.kind === 'done_only' && !input.tab ? 'finished' : input.tab;

    const page = await this.deps.inbox.list({
      workspace_id: workspaceId,
      ...(tab ? { tab } : {}),
      ...(input.agent_slug ? { agent_slug: input.agent_slug } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.source_type ? { source_type: input.source_type } : {}),
      ...(input.q ? { q: input.q } : {}),
      ...(scope.kind === 'own' ? { recipient_user_id: scope.user_id } : {}),
      limit: input.limit,
      cursor: input.cursor ?? null,
    });
    const read = await this.deps.inbox.readItemIds(context.user_id, page.items.map((i) => i.id));
    return {
      items: page.items.map((item) =>
        buildItemView({ item, approval: null, input_request: null }, context, { unread: !read.has(item.id) }),
      ),
      next_cursor: page.next_cursor,
    };
  }
}
