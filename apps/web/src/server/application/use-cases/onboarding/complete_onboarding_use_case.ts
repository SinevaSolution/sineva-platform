import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { OFFERING_LIMIT, type ProfileFields } from '@/server/domain/business_profile/business_profile';
import {
  collectProfileTexts,
  inspectProfileText,
  type ProfileWarning,
} from '@/server/domain/business_profile/profile_text_guard';
import type { OnboardingAnswers, OnboardingStateEntity } from '@/server/domain/onboarding/onboarding';
import { hasPermission } from '@/server/domain/permissions/registry';
import type {
  ChecklistRepository,
  OnboardingStateRepository,
  ProfileScanRepository,
} from '@/server/domain/repositories/onboarding_repositories';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { CompleteOnboardingDto } from '@/server/application/dtos/onboarding_dto';
import { applyConfirmedFields } from '@/server/application/use-cases/business-profile/apply_confirmed_fields';
import { toProfileResult, type BusinessProfileResult } from '@/server/application/use-cases/business-profile/get_business_profile_use_case';
import type { BusinessProfileWriter } from '@/server/application/use-cases/business-profile/profile_writer';
import { resolveFieldSources } from '@/server/application/use-cases/business-profile/save_business_profile_use_case';

export interface CompleteOnboardingResult extends BusinessProfileResult {
  state: OnboardingStateEntity;
  version: number;
  warnings: ProfileWarning[];
}

/** What the owner already typed in the steps becomes the base of the profile they confirm. */
function valuesFromAnswers(answers: OnboardingAnswers): Partial<ProfileFields> {
  const values: Partial<ProfileFields> = {};
  if (answers.business_name) values.display_name = answers.business_name;
  if (answers.business_type) values.industry = answers.business_type;
  if (answers.city) values.city = answers.city;
  if (answers.province) values.province = answers.province;
  if (answers.website_url) values.website_url = answers.website_url;
  if (answers.goals && answers.goals.length > 0) values.goals = answers.goals;
  if (answers.language) values.languages = [answers.language];
  // Instagram and marketplace inputs are kept as links and handles only.
  const handles: NonNullable<ProfileFields['social_handles']> = {};
  if (answers.instagram_handle) handles.instagram = answers.instagram_handle;
  if (answers.marketplace_url) handles.marketplace_url = answers.marketplace_url;
  if (Object.keys(handles).length > 0) values.social_handles = handles;
  return values;
}

export class CompleteOnboardingUseCase {
  constructor(
    private readonly deps: {
      states: OnboardingStateRepository;
      writer: BusinessProfileWriter;
      scans: ProfileScanRepository;
      checklist: ChecklistRepository;
      audit: AuditLogger;
      transactions: TransactionRunner;
      now: () => Date;
    },
  ) {}

  /**
   * "Confirm profile" (FR-ONB-06). Writes exactly the values the owner confirms
   * (their step answers plus what the review sends), each with `confirmed_at`,
   * as one version. Suggestions from a scan that the owner did not send are
   * discarded with the scan, never persisted.
   */
  async execute(input: {
    workspace_id: string;
    user_id: string;
    role: UserRole;
    input: CompleteOnboardingDto;
    context: RequestContext;
  }): Promise<CompleteOnboardingResult> {
    if (!hasPermission(input.role, 'onboarding.run').allowed) {
      throw new ForbiddenError('Only the owner can confirm the profile through onboarding.');
    }
    const state = await this.deps.states.find(input.workspace_id, input.user_id);
    if (!state) {
      throw new NotFoundError('Onboarding state', input.workspace_id);
    }
    if (state.status === 'completed') {
      throw new ConflictError('Onboarding', input.workspace_id);
    }

    const values: Partial<ProfileFields> = { ...valuesFromAnswers(state.answers) };
    for (const [key, value] of Object.entries(input.input.profile ?? {})) {
      if (value !== undefined) (values as Record<string, unknown>)[key] = value;
    }
    if (!values.display_name) {
      throw new ValidationError('A business name is needed to confirm the profile.', [
        { code: 'business_name_required', field: 'profile.display_name', detail: 'Add your business name first.' },
      ]);
    }

    // Everything that can refuse runs before any write.
    const offerings = (input.input.offerings ?? []).filter((o) => o.confirmed !== false);
    const policies = (input.input.policies ?? []).filter((p) => p.confirmed !== false);
    if (offerings.length > OFFERING_LIMIT) {
      throw new ValidationError(`A workspace can hold up to ${OFFERING_LIMIT} offers.`, [
        { code: 'offerings_limit_reached', field: 'offerings', detail: `At most ${OFFERING_LIMIT} offers.` },
      ]);
    }
    const warnings = inspectProfileText([
      ...collectProfileTexts(values),
      ...offerings.flatMap((o) => [
        { field: 'offerings.name', text: o.name },
        ...(o.description ? [{ field: 'offerings.description', text: o.description }] : []),
      ]),
      ...policies.flatMap((p) => [
        { field: 'policies.title', text: p.title },
        { field: 'policies.body', text: p.body },
      ]),
    ]);
    const now = this.deps.now();
    const sources = await resolveFieldSources(this.deps.scans, now, input.workspace_id, values, {
      field_sources: input.input.field_sources as never,
      scan_id: input.input.scan_id,
    });

    return this.deps.transactions.run(async () => {
      const written = await this.deps.writer.mutate(
        {
          workspace_id: input.workspace_id,
          user_id: input.user_id,
          context: input.context,
          audit_action: 'profile.updated',
        },
        async (repo) => {
          await applyConfirmedFields(repo, {
            workspace_id: input.workspace_id,
            user_id: input.user_id,
            values,
            sources,
            now: now.toISOString(),
          });
          for (const o of offerings) {
            await repo.createOffering(input.workspace_id, {
              name: o.name,
              description: o.description ?? null,
              price_amount: o.price_amount ?? null,
              price_currency: 'IDR',
              url: o.url ?? null,
              source: o.source ?? 'user',
              confirmed_at: now.toISOString(),
            });
          }
          for (const p of policies) {
            await repo.createPolicy(input.workspace_id, {
              kind: p.kind,
              title: p.title,
              body: p.body,
              source: p.source ?? 'user',
              confirmed_at: now.toISOString(),
              updated_by: input.user_id,
            });
          }
          return { section: 'onboarding', offerings: offerings.length, policies: policies.length };
        },
      );

      const completed = await this.deps.states.update(input.workspace_id, input.user_id, {
        status: 'completed',
        completed_at: now.toISOString(),
      });
      await this.deps.checklist.markDone(input.workspace_id, 'confirm_profile', 'onboarding.completed');
      if (input.input.scan_id) {
        await this.deps.scans.discard(input.workspace_id, input.input.scan_id);
      }
      await this.deps.audit.log({
        action: 'onboarding.completed',
        context: input.context,
        workspace_id: input.workspace_id,
        target_resource_id: input.workspace_id,
        target_resource_type: 'workspace',
        metadata: { version: written.version },
      });

      return {
        ...toProfileResult(input.workspace_id, written.aggregate),
        state: completed,
        version: written.version,
        warnings,
      };
    });
  }
}
