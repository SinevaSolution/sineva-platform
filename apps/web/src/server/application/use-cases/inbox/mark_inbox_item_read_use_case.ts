import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import { canSee, workspaceOf } from './inbox_access';

/** POST .../inbox/{item_id}/read. Per person and idempotent. */
export class MarkInboxItemReadUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: { inbox: InboxRepository; now?: () => Date }) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(itemId: string, context: RequestContext): Promise<{ read: true }> {
    const workspaceId = workspaceOf(context);
    const bundle = await this.deps.inbox.findBundle(workspaceId, itemId);
    if (!bundle || !canSee(bundle.item, context)) throw new NotFoundError('Inbox item', itemId);
    await this.deps.inbox.markRead(workspaceId, itemId, context.user_id, this.now());
    return { read: true };
  }
}
