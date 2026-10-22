import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/domain_error';
import { tabOf, type InboxItemEntity } from '@/server/domain/inbox/inbox_item';
import { hasPermission } from '@/server/domain/permissions/registry';

// Visibility by role (FR-INBOX-05), decided here and applied in the repository
// query, not only in the UI. Owner and admin see everything in the workspace;
// a member sees what is addressed to them; a viewer sees summaries of finished work (Updates and
// Done, OQ-INBOX-5 default, ADR-0034).

export type InboxScope =
  | { kind: 'all' }
  | { kind: 'own'; user_id: string }
  | { kind: 'done_only' };

export function workspaceOf(context: RequestContext): string {
  if (!context.workspace_id) throw new ForbiddenError('A workspace is required');
  return context.workspace_id;
}

export function scopeOf(context: RequestContext): InboxScope {
  const role = context.role;
  if (!role) throw new ForbiddenError('A role is required');
  if (hasPermission(role, 'approval.decide_any').allowed) return { kind: 'all' };
  if (hasPermission(role, 'approval.decide_own').allowed) return { kind: 'own', user_id: context.user_id };
  return { kind: 'done_only' };
}

export function canSee(item: Pick<InboxItemEntity, 'kind' | 'state' | 'recipient_user_id'>, context: RequestContext): boolean {
  const scope = scopeOf(context);
  if (scope.kind === 'all') return true;
  if (scope.kind === 'own') return item.recipient_user_id === scope.user_id;
  const tab = tabOf(item);
  return tab === 'done' || tab === 'updates';
}

/** Whether this person may decide or answer the item: any for owner and admin, own for a member. */
export function canAct(item: Pick<InboxItemEntity, 'recipient_user_id'>, context: RequestContext): boolean {
  const scope = scopeOf(context);
  if (scope.kind === 'all') return true;
  return scope.kind === 'own' && item.recipient_user_id === scope.user_id;
}

/** An item you may not act on is a 404, the same answer as one that does not exist. */
export function requireActor(item: InboxItemEntity | null, context: RequestContext, label: string, id: string): InboxItemEntity {
  if (!item || !canAct(item, context)) throw new NotFoundError(label, id);
  return item;
}

export function isViewer(context: RequestContext): boolean {
  return scopeOf(context).kind === 'done_only';
}
