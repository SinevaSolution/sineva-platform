import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { InboxItemView } from '@/shared/inbox_view';
import { canSee, workspaceOf } from './inbox_access';
import { buildItemView } from './inbox_view_builder';

/** GET .../inbox/{item_id}. An item you may not see is the same 404 as one that does not exist. */
export class GetInboxItemUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(itemId: string, context: RequestContext): Promise<InboxItemView> {
    const workspaceId = workspaceOf(context);
    const bundle = await this.deps.inbox.findBundle(workspaceId, itemId);
    if (!bundle || !canSee(bundle.item, context)) throw new NotFoundError('Inbox item', itemId);

    const read = await this.deps.inbox.readItemIds(context.user_id, [itemId]);
    const revisions = bundle.approval ? await this.deps.inbox.listRevisions(bundle.approval.id) : [];
    return buildItemView(bundle, context, { unread: !read.has(itemId), detail: { revisions } });
  }
}
