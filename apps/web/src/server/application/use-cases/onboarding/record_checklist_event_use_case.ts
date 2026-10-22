import type { ChecklistItemKey } from '@/server/domain/onboarding/onboarding';
import type { ChecklistRepository } from '@/server/domain/repositories/onboarding_repositories';

/**
 * Called by the code that owns the real event (profile confirmed, a Library
 * document reaching Ready), never by a route a client can press: a checklist
 * item completes from what happened, not from a click.
 */
export class RecordChecklistEventUseCase {
  constructor(private readonly deps: { checklist: ChecklistRepository }) {}

  async execute(input: { workspace_id: string; item_key: ChecklistItemKey; source: string }): Promise<void> {
    await this.deps.checklist.markDone(input.workspace_id, input.item_key, input.source);
  }
}
