import type { RequestContext } from '@/server/domain/context/request_context';
import type { InboxItemView } from '@/shared/inbox_view';
import { settleInputRequest, type InputRequestDeps } from './input_request_flow';

export interface AnswerInputInput {
  /** The input request version the caller last saw. */
  version: number;
  answers: Record<string, unknown>;
}

/** POST .../inbox/{item_id}/answer. */
export class AnswerInputRequestUseCase {
  constructor(private readonly deps: InputRequestDeps) {}

  execute(itemId: string, input: AnswerInputInput, context: RequestContext): Promise<InboxItemView> {
    return settleInputRequest(
      this.deps,
      { item_id: itemId, mode: 'answered', version: input.version, answers: input.answers },
      context,
    );
  }
}
