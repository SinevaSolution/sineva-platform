import type { UserRole } from '@/server/domain/entities/user';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { isKnownFirstTaskId, type DismissedTask } from '@/server/domain/onboarding/first_task_catalog';
import type { OnboardingStateRepository } from '@/server/domain/repositories/onboarding_repositories';
import { flowForRole } from './get_onboarding_use_case';

const MAX_REMEMBERED = 50;

export class DismissFirstTaskUseCase {
  constructor(private readonly deps: { states: OnboardingStateRepository; now: () => Date }) {}

  /** A dismissed task stays out of the suggestions for a week (FR-ONB-23). */
  async execute(input: {
    workspace_id: string;
    user_id: string;
    role: UserRole;
    task_id: string;
  }): Promise<DismissedTask[]> {
    if (!isKnownFirstTaskId(input.task_id)) {
      throw new ValidationError('Unknown task.', [{ code: 'unknown_task', field: 'task_id', detail: 'Unknown task.' }]);
    }
    const { states, now } = this.deps;

    let state = await states.find(input.workspace_id, input.user_id);
    if (!state) {
      state = await states.create({
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        flow: flowForRole(input.role),
        current_step: 1,
        answers: {},
        skipped_steps: [],
      });
    }
    const dismissed = [
      ...state.dismissed_tasks.filter((d) => d.task_id !== input.task_id),
      { task_id: input.task_id, dismissed_at: now().toISOString() },
    ].slice(-MAX_REMEMBERED);
    await states.update(input.workspace_id, input.user_id, { dismissed_tasks: dismissed });
    return dismissed;
  }
}
