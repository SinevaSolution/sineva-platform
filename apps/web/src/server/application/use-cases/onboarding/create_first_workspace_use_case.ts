import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import {
  ConflictError,
  DomainError,
  FirstWorkspaceNotAllowedError,
  NotFoundError,
} from '@/server/domain/errors/domain_error';
import { PROVISIONAL_WORKSPACE_NAME, type OnboardingStateEntity } from '@/server/domain/onboarding/onboarding';
import type { InvitationReader, OnboardingStateRepository } from '@/server/domain/repositories/onboarding_repositories';
import type { UserProfileRepository } from '@/server/domain/repositories/user_profile_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import { generateWorkspaceSlug } from '@/server/domain/tenancy/tenant_isolation';
import type { CreateWorkspaceInput } from '@/server/application/use-cases/workspace/create_workspace_use_case';

export interface CreateFirstWorkspaceResult {
  workspace: WorkspaceEntity;
  state: OnboardingStateEntity;
}

const SLUG_ATTEMPTS = 3;

/**
 * The first workspace of a person who signed up without an invitation: the
 * provisional workspace the onboarding flow then renames (FR-ONB-01).
 *
 * It delegates creation to the workspace use case, so the
 * `workspaces.owned.max` entitlement check, the owner membership and the
 * `workspace.created` audit row are the same as for any workspace; this class
 * only decides WHETHER the person may have one and what it is called.
 */
export class CreateFirstWorkspaceUseCase {
  constructor(
    private readonly deps: {
      workspaces: WorkspaceRepository;
      createWorkspace: { execute(input: CreateWorkspaceInput): Promise<WorkspaceEntity> };
      profiles: UserProfileRepository;
      invitations: InvitationReader;
      states: OnboardingStateRepository;
      audit: AuditLogger;
      transactions: TransactionRunner;
      now: () => Date;
      /** Random lowercase hex for the provisional slug, so names never collide in a counter loop. */
      newSlugSuffix: () => string;
    },
  ) {}

  async execute(input: { user_id: string; context: RequestContext }): Promise<CreateFirstWorkspaceResult> {
    const { workspaces, createWorkspace, profiles, invitations, states, audit, transactions, now, newSlugSuffix } =
      this.deps;

    const profile = await profiles.findById(input.user_id);
    if (!profile) {
      throw new NotFoundError('User', input.user_id);
    }
    // FR-AUTH-03: no workspace action before the email is verified.
    if (!profile.email_verified) {
      throw new DomainError({
        message: 'Email verification is required before taking workspace actions.',
        code: 'email_not_verified',
        status: 403,
      });
    }

    if ((await workspaces.listForUser(input.user_id)).length > 0) {
      throw new FirstWorkspaceNotAllowedError('already_has_workspace');
    }
    // An invited person joins the inviting workspace. Giving them one of their
    // own here would also mean they never see the member welcome.
    if (await invitations.hasPendingForEmail(profile.email.toLowerCase(), now())) {
      throw new FirstWorkspaceNotAllowedError('invited_user');
    }

    const name = PROVISIONAL_WORKSPACE_NAME[profile.locale === 'en' ? 'en' : 'id'];
    const base = generateWorkspaceSlug(name);

    return transactions.run(async () => {
      let workspace: WorkspaceEntity | null = null;
      for (let attempt = 0; attempt < SLUG_ATTEMPTS && !workspace; attempt += 1) {
        try {
          workspace = await createWorkspace.execute({
            workspace_name: name,
            workspace_slug: `${base}-${newSlugSuffix()}`,
            owner_user_id: input.user_id,
            default_locale: profile.locale,
            timezone: profile.timezone,
            context: input.context,
          });
        } catch (error) {
          // A taken slug is the only failure worth another try, with a new suffix.
          if (!(error instanceof ConflictError) || attempt === SLUG_ATTEMPTS - 1) {
            throw error;
          }
        }
      }
      const created = workspace as WorkspaceEntity;

      const state = await states.create({
        workspace_id: created.id,
        user_id: input.user_id,
        flow: 'owner',
        current_step: 1,
        answers: {},
        skipped_steps: [],
      });
      await audit.log({
        action: 'onboarding.started',
        context: input.context,
        workspace_id: created.id,
        target_resource_id: created.id,
        target_resource_type: 'workspace',
        metadata: { flow: 'owner' },
      });
      return { workspace: created, state };
    });
  }
}
