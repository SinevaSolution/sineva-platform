import { selectFirstTasks, BUSINESS_TYPES, type FirstTask, type TaskLocale } from '@/server/domain/onboarding/first_task_catalog';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';
import type { OnboardingStateRepository } from '@/server/domain/repositories/onboarding_repositories';

export class GetFirstTasksUseCase {
  constructor(
    private readonly deps: { states: OnboardingStateRepository; repo: BusinessProfileRepository; now: () => Date },
  ) {}

  /**
   * Exactly three curated tasks filled with the CONFIRMED business name and
   * first confirmed offer (FR-ONB-21, 22). Nothing is free-written and an
   * unconfirmed value never appears in a task.
   */
  async execute(input: { workspace_id: string; user_id: string; locale?: TaskLocale }): Promise<FirstTask[]> {
    const state = await this.deps.states.find(input.workspace_id, input.user_id);
    const aggregate = await this.deps.repo.load(input.workspace_id);
    const answers = state?.answers ?? {};
    const profile = aggregate.profile;

    const confirmedName = profile?.field_meta.display_name ? profile.display_name : null;
    const firstOffer = aggregate.offerings.filter((o) => o.confirmed_at).sort((a, b) => a.position - b.position)[0];
    const businessType = BUSINESS_TYPES.find((type) => type === answers.business_type) ?? null;

    return selectFirstTasks({
      business_type: businessType,
      goals: answers.goals ?? [],
      locale: input.locale ?? answers.language ?? 'id',
      business_name: confirmedName ?? answers.business_name ?? null,
      offer_name: firstOffer?.name ?? null,
      dismissed: state?.dismissed_tasks ?? [],
      now: this.deps.now(),
    });
  }
}
