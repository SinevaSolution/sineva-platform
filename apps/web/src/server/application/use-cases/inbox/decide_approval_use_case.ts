import type { RequestContext } from '@/server/domain/context/request_context';
import type { InboxItemView } from '@/shared/inbox_view';
import { ApprovalDecisionService, type ApprovalDecisionDeps } from './approval_decision_service';

export interface DecideApprovalInput {
  decision: 'approve' | 'reject';
  version: number;
  note?: string;
  /** Edits to the fields the action type marks editable; approve only. */
  edited_payload?: Record<string, unknown>;
}

/** POST .../approvals/{id}/decision. */
export class DecideApprovalUseCase {
  private readonly service: ApprovalDecisionService;

  constructor(deps: ApprovalDecisionDeps) {
    this.service = new ApprovalDecisionService(deps);
  }

  execute(approvalId: string, input: DecideApprovalInput, context: RequestContext): Promise<InboxItemView> {
    return this.service.decide({ approval_id: approvalId, ...input }, context);
  }
}
