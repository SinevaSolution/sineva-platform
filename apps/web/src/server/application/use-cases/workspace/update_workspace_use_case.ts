import type {
  UpdateWorkspaceInput as RepoUpdateInput,
  WorkspaceRepository,
} from '@/server/domain/repositories/workspace_repository';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '@/server/domain/errors/domain_error';
import {
  isReservedSlug,
  validateWorkspaceId,
} from '@/server/domain/tenancy/tenant_isolation';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface UpdateWorkspaceUseCaseInput {
  workspace_id: string;
  workspace_name?: string;
  workspace_slug?: string;
  logo_url?: string | null;
  default_locale?: string;
  timezone?: string;
}

export class UpdateWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: UpdateWorkspaceUseCaseInput): Promise<WorkspaceEntity> {
    validateWorkspaceId(input.workspace_id);

    const existing = await this.workspaceRepo.findById(input.workspace_id);
    if (!existing) {
      throw new NotFoundError('Workspace', input.workspace_id);
    }

    const updates: RepoUpdateInput = {};

    if (input.workspace_name !== undefined) {
      const name = input.workspace_name.trim();
      if (!name || name.length > 100) {
        throw new ValidationError(
          'Workspace name must be between 1 and 100 characters',
          [
            {
              code: 'invalid_name',
              field: 'workspace_name',
              detail: 'Must be between 1 and 100 characters',
            },
          ],
        );
      }
      updates.workspace_name = name;
    }

    if (input.workspace_slug !== undefined) {
      const newSlug = input.workspace_slug.toLowerCase().trim();

      if (newSlug !== existing.workspace_slug) {
        // FR-SHELL-13: Slug is editable once afterwards
        if (existing.slug_changed_at !== null) {
          throw new ValidationError(
            'Workspace slug can only be customized once.',
            [
              {
                code: 'slug_already_changed',
                field: 'workspace_slug',
                detail: 'The workspace slug has already been customized and cannot be changed again.',
              },
            ],
          );
        }

        if (isReservedSlug(newSlug)) {
          throw new ValidationError('This workspace slug is reserved.', [
            {
              code: 'reserved_slug',
              field: 'workspace_slug',
              detail: 'This slug is reserved for system use',
            },
          ]);
        }

        const exists = await this.workspaceRepo.slugExists(newSlug);
        if (exists) {
          throw new ConflictError('Workspace', newSlug);
        }

        updates.workspace_slug = newSlug;
        updates.slug_changed_at = new Date();
      }
    }

    if (input.logo_url !== undefined) {
      updates.logo_url = input.logo_url;
    }
    if (input.default_locale !== undefined) {
      updates.default_locale = input.default_locale;
    }
    if (input.timezone !== undefined) {
      updates.timezone = input.timezone;
    }

    const updated = await this.workspaceRepo.update(input.workspace_id, updates);

    await this.auditLogger.log({
      action: 'workspace.updated',
      context: {
        ...createAnonymousRequestContext('workspace-update'),
        workspace_id: updated.id,
      },
      target_resource_id: updated.id,
      target_resource_type: 'workspace',
      metadata: {
        updated_fields: Object.keys(updates),
      },
    });

    return updated;
  }
}
