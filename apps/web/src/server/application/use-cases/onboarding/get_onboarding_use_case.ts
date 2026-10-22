import { hasPermission } from '@/server/domain/permissions/registry';
import type { UserRole } from '@/server/domain/entities/user';
import {
  CHECKLIST_ITEMS,
  type ChecklistItemState,
  type OnboardingFlow,
  type OnboardingStateEntity,
} from '@/server/domain/onboarding/onboarding';
import type {
  ChecklistRepository,
  InvitationReader,
  OnboardingStateRepository,
} from '@/server/domain/repositories/onboarding_repositories';

/** Only the owner runs the five-step flow; every other role gets the member welcome (FR-ONB-08). */
export function flowForRole(role: UserRole): OnboardingFlow {
  return hasPermission(role, 'onboarding.run').allowed ? 'owner' : 'member';
}

export function defaultOnboardingState(workspaceId: string, userId: string, flow: OnboardingFlow): OnboardingStateEntity {
  return {
    id: null,
    workspace_id: workspaceId,
    user_id: userId,
    flow,
    status: 'in_progress',
    current_step: 1,
    answers: {},
    skipped_steps: [],
    dismissed_tasks: [],
    started_at: null,
    completed_at: null,
    persisted: false,
  };
}

export class GetOnboardingUseCase {
  constructor(
    private readonly deps: {
      states: OnboardingStateRepository;
      checklist: ChecklistRepository;
      invitations: InvitationReader;
    },
  ) {}

  /** A read never writes: a person with no row gets the defaults, `persisted: false`. */
  async execute(input: {
    workspace_id: string;
    user_id: string;
    role: UserRole;
  }): Promise<{ state: OnboardingStateEntity; checklist: ChecklistItemState[] }> {
    const stored = await this.deps.states.find(input.workspace_id, input.user_id);
    const state = stored ?? defaultOnboardingState(input.workspace_id, input.user_id, flowForRole(input.role));
    return { state, checklist: await this.checklist(input.workspace_id) };
  }

  // Items complete from real events (FR-ONB-07): a stored completion written by
  // the event handler, or a fact read from where it lives (an accepted invitation).
  private async checklist(workspaceId: string): Promise<ChecklistItemState[]> {
    const done = new Map((await this.deps.checklist.listDone(workspaceId)).map((d) => [d.item_key, d.completed_at]));
    if (!done.has('invite_teammate') && (await this.deps.invitations.hasAcceptedInvitation(workspaceId))) {
      done.set('invite_teammate', '');
    }
    return CHECKLIST_ITEMS.map((item_key) => ({
      item_key,
      status: done.has(item_key) ? 'done' : 'pending',
      completed_at: done.get(item_key) || null,
    }));
  }
}
