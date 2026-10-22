import type { RequestContext } from '@/server/domain/context/request_context';
import type { InboxItemView } from '@/shared/inbox_view';
import { ApprovalDecisionService, type ApprovalDecisionDeps } from './approval_decision_service';

export interface RequestChangesInput {
  version: number;
  /** What the person wants changed, in words. Goes to the specialist, never to the audit log. */
  instruction: string;
}

/** POST .../approvals/{id}/changes. */
export class RequestApprovalChangesUseCase {
  private readonly service: ApprovalDecisionService;

  constructor(deps: ApprovalDecisionDeps) {
    this.service = new ApprovalDecisionService(deps);
  }

  execute(approvalId: string, input: RequestChangesInput, context: RequestContext): Promise<InboxItemView> {
    return this.service.decide({ approval_id: approvalId, decision: 'changes', ...input }, context);
  }
}
