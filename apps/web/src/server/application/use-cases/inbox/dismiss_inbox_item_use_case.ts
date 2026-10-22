import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { NotDismissableError } from '@/server/domain/inbox/inbox_errors';
import type { InboxItemView } from '@/shared/inbox_view';
import { requireActor, workspaceOf } from './inbox_access';
import { settleInputRequest, type InputRequestDeps } from './input_request_flow';

/**
 * POST .../inbox/{item_id}/dismiss. Only an open input request can be
 * dismissed (the run is told the question went unanswered). An approval needs
 * a decision, because dismissing it would leave its run waiting for nothing;
 * finished items have nothing to dismiss.
 */
export class DismissInboxItemUseCase {
  constructor(private readonly deps: InputRequestDeps) {}

  async execute(itemId: string, context: RequestContext): Promise<InboxItemView> {
    const bundle = await this.deps.inbox.findBundle(workspaceOf(context), itemId);
    requireActor(bundle?.item ?? null, context, 'Inbox item', itemId);
    if (!bundle) throw new NotFoundError('Inbox item', itemId);
    if (!bundle.input_request || bundle.item.state !== 'open') throw new NotDismissableError();
    return settleInputRequest(this.deps, { item_id: itemId, mode: 'dismissed' }, context);
  }
}
