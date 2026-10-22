import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import { ConflictError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import {
  UNSKIPPABLE_MEMBER_STEPS,
  UNSKIPPABLE_OWNER_STEPS,
  type OnboardingAnswers,
  type OnboardingStateEntity,
} from '@/server/domain/onboarding/onboarding';
import type { OnboardingStateRepository } from '@/server/domain/repositories/onboarding_repositories';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { generateWorkspaceSlug } from '@/server/domain/tenancy/tenant_isolation';
import {
  MEMBER_STEP_KEYS,
  OWNER_STEP_KEYS,
  parseStepAnswers,
  stepCount,
  type PatchOnboardingDto,
} from '@/server/application/dtos/onboarding_dto';
import type { UpdateWorkspaceUseCaseInput } from '@/server/application/use-cases/workspace/update_workspace_use_case';
import { flowForRole } from './get_onboarding_use_case';

const SLUG_ATTEMPTS = 5;
const SLUG_BASE_ROOM = 40;

export interface UpdateOnboardingInput {
  workspace_id: string;
  user_id: string;
  role: UserRole;
  step: PatchOnboardingDto['step'];
  action: PatchOnboardingDto['action'];
  answers?: Record<string, unknown>;
  context: RequestContext;
}

export class UpdateOnboardingUseCase {
  constructor(
    private readonly deps: {
      states: OnboardingStateRepository;
      workspaces: WorkspaceRepository;
      updateWorkspace: { execute(input: UpdateWorkspaceUseCaseInput): Promise<WorkspaceEntity> };
      audit: AuditLogger;
      transactions: TransactionRunner;
      now: () => Date;
      newSlugSuffix: () => string;
    },
  ) {}

  async execute(input: UpdateOnboardingInput): Promise<{ state: OnboardingStateEntity; workspace: WorkspaceEntity }> {
    const flow = flowForRole(input.role);
    const total = stepCount(flow);
    if (input.step > total) {
      throw new ValidationError(`This flow has ${total} steps.`, [
        { code: 'invalid_step', field: 'step', detail: `Step must be between 1 and ${total}.` },
      ]);
    }
    if (input.action === 'skip') {
      const unskippable = flow === 'owner' ? UNSKIPPABLE_OWNER_STEPS : UNSKIPPABLE_MEMBER_STEPS;
      if (unskippable.includes(input.step)) {
        throw new ValidationError('This step cannot be skipped.', [
          { code: 'step_not_skippable', field: 'step', detail: 'Language and business name are required.' },
        ]);
      }
    }
    // Strict, per-step validation first: nothing is written for a refused answer.
    const parsed = input.action === 'save' ? parseStepAnswers(flow, input.step, input.answers) : {};

    return this.deps.transactions.run(async () => {
      const { states, audit } = this.deps;

      let state = await states.find(input.workspace_id, input.user_id);
      if (!state) {
        state = await states.create({
          workspace_id: input.workspace_id,
          user_id: input.user_id,
          flow,
          current_step: 1,
          answers: {},
          skipped_steps: [],
        });
        await audit.log({
          action: 'onboarding.started',
          context: input.context,
          workspace_id: input.workspace_id,
          target_resource_id: input.workspace_id,
          target_resource_type: 'workspace',
          metadata: { flow },
        });
      }

      let answers: OnboardingAnswers = { ...state.answers };
      let workspace = await this.deps.workspaces.findById(input.workspace_id);
      if (!workspace) {
        throw new NotFoundError('Workspace', input.workspace_id);
      }

      if (input.action === 'save') {
        const keys = (flow === 'owner' ? OWNER_STEP_KEYS : MEMBER_STEP_KEYS)[input.step - 1];
        for (const key of keys) delete (answers as Record<string, unknown>)[key];
        answers = { ...answers, ...parsed } as OnboardingAnswers;

        if (flow === 'owner' && input.step === 2) {
          const rename = await this.renameProvisionalWorkspace(workspace, answers, input.context);
          workspace = rename.workspace;
          answers = rename.answers;
        }
      }

      const skipped = new Set(state.skipped_steps);
      if (input.action === 'skip') skipped.add(input.step);
      else skipped.delete(input.step);

      // Re-saving an earlier step never moves the person backwards.
      const currentStep = Math.max(state.current_step, Math.min(total, input.step + 1));

      const updated = await states.update(input.workspace_id, input.user_id, {
        answers,
        skipped_steps: [...skipped].sort((a, b) => a - b),
        current_step: currentStep,
      });

      await audit.log({
        action: input.action === 'save' ? 'onboarding.step_completed' : 'onboarding.skipped',
        context: input.context,
        workspace_id: input.workspace_id,
        target_resource_id: input.workspace_id,
        target_resource_type: 'workspace',
        // The step number only: answers carry business details and a phone number.
        metadata: { step: input.step, flow },
      });

      return { state: updated, workspace };
    });
  }

  /**
   * Step 2: the business name renames the provisional workspace, and the slug
   * is regenerated from it exactly once (FR-ONB-03). The once is kept in the
   * answers, and the regeneration is skipped when the owner already used their
   * one deliberate slug edit. The slug change does not spend that edit
   * (`provisional_slug`).
   */
  private async renameProvisionalWorkspace(
    workspace: WorkspaceEntity,
    answers: OnboardingAnswers,
    context: RequestContext,
  ): Promise<{ workspace: WorkspaceEntity; answers: OnboardingAnswers }> {
    const name = answers.business_name;
    if (!name || name === workspace.workspace_name) {
      return { workspace, answers };
    }

    const regenerate = !answers.slug_regenerated && workspace.slug_changed_at === null;
    const slug = regenerate ? await this.uniqueSlug(name, workspace) : undefined;

    const updated = await this.deps.updateWorkspace.execute({
      workspace_id: workspace.id,
      workspace_name: name,
      workspace_slug: slug && slug !== workspace.workspace_slug ? slug : undefined,
      provisional_slug: true,
      context,
    });
    return { workspace: updated, answers: regenerate ? { ...answers, slug_regenerated: true } : answers };
  }

  private async uniqueSlug(name: string, workspace: WorkspaceEntity): Promise<string> {
    const base = generateWorkspaceSlug(name);
    if (base === workspace.workspace_slug || !(await this.deps.workspaces.slugExists(base))) {
      return base;
    }
    const room = base.slice(0, SLUG_BASE_ROOM).replace(/-+$/, '');
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const candidate = `${room}-${this.deps.newSlugSuffix()}`;
      if (!(await this.deps.workspaces.slugExists(candidate))) {
        return candidate;
      }
    }
    throw new ConflictError('Workspace', base);
  }
}
