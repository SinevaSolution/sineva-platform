import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  ValidationError,
  ConflictError,
} from '@/server/domain/errors/domain_error';
import {
  generateWorkspaceSlug,
  isReservedSlug,
} from '@/server/domain/tenancy/tenant_isolation';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface CreateWorkspaceInput {
  workspace_name: string;
  workspace_slug?: string;
  owner_user_id: string;
  default_locale?: string;
  timezone?: string;
  logo_url?: string | null;
}

export class CreateWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    const name = input.workspace_name.trim();
    if (!name || name.length > 100) {
      throw new ValidationError(
        'Workspace name is required and must not exceed 100 characters',
        [
          {
            code: 'invalid_name',
            field: 'workspace_name',
            detail: 'Must be between 1 and 100 characters',
          },
        ],
      );
    }

    let slug: string;
    if (input.workspace_slug) {
      slug = input.workspace_slug.toLowerCase().trim();
      if (isReservedSlug(slug)) {
        throw new ValidationError('This workspace slug is reserved.', [
          {
            code: 'reserved_slug',
            field: 'workspace_slug',
            detail: 'This slug is reserved for system use',
          },
        ]);
      }
      const exists = await this.workspaceRepo.slugExists(slug);
      if (exists) {
        throw new ConflictError('Workspace', slug);
      }
    } else {
      const baseSlug = generateWorkspaceSlug(name);
      slug = baseSlug;
      let counter = 1;
      while (await this.workspaceRepo.slugExists(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }
    }

    const workspace = await this.workspaceRepo.create({
      workspace_name: name,
      workspace_slug: slug,
      owner_user_id: input.owner_user_id,
      default_locale: input.default_locale ?? 'id',
      timezone: input.timezone ?? 'Asia/Jakarta',
      logo_url: input.logo_url ?? null,
    });

    await this.auditLogger.log({
      action: 'workspace.created',
      context: {
        ...createAnonymousRequestContext('workspace-create'),
        user_id: input.owner_user_id,
        workspace_id: workspace.id,
      },
      target_resource_id: workspace.id,
      target_resource_type: 'workspace',
      metadata: {
        workspace_slug: workspace.workspace_slug,
        subscription_tier: workspace.subscription_tier,
      },
    });

    return workspace;
  }
}
