import type { RequestContext } from '@/server/domain/context/request_context';
import type { InboxRepository } from '@/server/domain/repositories/inbox_repository';
import type { InboxCountsView } from '@/shared/inbox_view';
import { scopeOf, workspaceOf } from './inbox_access';

/** GET .../inbox/counts: the badge and tab counts (FR-INBOX-04), scoped to what the caller may see. */
export class GetInboxCountsUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(context: RequestContext): Promise<InboxCountsView> {
    const scope = scopeOf(context);
    const counts = await this.deps.inbox.counts(
      workspaceOf(context),
      context.user_id,
      scope.kind === 'own' ? scope.user_id : undefined,
    );
    if (scope.kind === 'done_only') {
      // A viewer has no open items to count.
      return { needs_review: 0, needs_input: 0, done: counts.done, badge: 0, unread_needs_review: 0, unread_needs_input: 0 };
    }
    return { ...counts, badge: counts.needs_review + counts.needs_input };
  }
}
