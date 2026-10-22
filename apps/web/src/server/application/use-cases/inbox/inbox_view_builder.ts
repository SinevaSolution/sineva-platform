import type { RequestContext } from '@/server/domain/context/request_context';
import { getActionType } from '@/server/domain/approvals/action_types';
import { tabOf } from '@/server/domain/inbox/inbox_item';
import type { ApprovalRevisionEntity } from '@/server/domain/inbox/inbox_item';
import type { InboxBundle } from '@/server/domain/repositories/inbox_repository';
import type { InboxItemView, InboxRevisionView } from '@/shared/inbox_view';
import { isViewer } from './inbox_access';

/**
 * Builds the wire view of one item. A viewer gets a summary: no draft payload,
 * no revision bodies, no answers, no notes and no link back to the chat
 * (FR-INBOX-05, OQ-INBOX-5). `detail` adds the payload and revisions for
 * the people who may see them.
 */
export function buildItemView(
  bundle: InboxBundle,
  context: RequestContext,
  options: {
    unread: boolean;
    detail?: { revisions: ApprovalRevisionEntity[]; conversation_id?: string | null };
  },
): InboxItemView {
  const { item, approval, input_request: input } = bundle;
  const summaryOnly = isViewer(context);

  const view: InboxItemView = {
    id: item.id,
    kind: item.kind,
    tab: tabOf(item),
    state: item.state,
    agent_slug: item.agent_slug,
    title: item.title,
    summary: { key: item.summary_key, params: item.summary_params },
    source: {
      type: item.source_type,
      id: summaryOnly ? null : item.source_id,
      // Detail only: the list would need one lookup per row. A viewer gets no link back.
      ...(options.detail ? { conversation_id: summaryOnly ? null : (options.detail.conversation_id ?? null) } : {}),
    },
    unread: options.unread,
    expires_at: item.expires_at,
    resolved_at: item.resolved_at,
    created_at: item.created_at,
    approval: approval
      ? {
          id: approval.id,
          status: approval.status,
          action_type: approval.action_type,
          revision: approval.revision,
          version: approval.version,
          awaiting_revision: approval.awaiting_revision,
          risk_level: approval.risk_level,
          requirement: approval.requirement,
          guardrail_reason: approval.guardrail_reason,
          expires_at: approval.expires_at,
          decided_by: approval.decided_by,
          decided_by_name: approval.decided_by_name,
          decided_at: approval.decided_at,
          ...(summaryOnly
            ? {}
            : { decision_note: approval.decision_note, change_request: approval.change_request }),
        }
      : null,
    input_request: input
      ? {
          id: input.id,
          status: input.status,
          question: input.question,
          fields: input.fields,
          version: input.version,
          due_at: input.due_at,
          answered_by: input.answered_by,
          answered_at: input.answered_at,
          ...(summaryOnly ? {} : { answer: input.answer }),
        }
      : null,
  };

  if (options.detail && approval && !summaryOnly) {
    const definition = getActionType(approval.action_type);
    view.payload = approval.payload;
    if (definition) {
      view.editable_fields = [...definition.editable_fields];
      view.approve_note_key = definition.approve_note_key;
    }
    view.revisions = options.detail.revisions.map(
      (r): InboxRevisionView => ({
        revision: r.revision,
        payload_hash: r.payload_hash,
        created_by: r.created_by,
        created_at: r.created_at,
        payload: r.payload,
      }),
    );
  } else if (options.detail && approval && summaryOnly) {
    view.revisions = options.detail.revisions.map((r) => ({
      revision: r.revision,
      payload_hash: r.payload_hash,
      created_by: r.created_by,
      created_at: r.created_at,
    }));
  }
  return view;
}
