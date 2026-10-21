import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { validateWorkspaceId } from '@/server/domain/tenancy/tenant_isolation';

export interface GetWorkspaceInput {
  workspace_id: string;
}

export class GetWorkspaceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(input: GetWorkspaceInput): Promise<WorkspaceEntity> {
    validateWorkspaceId(input.workspace_id);
    const workspace = await this.workspaceRepo.findById(input.workspace_id);
    if (!workspace) {
      throw new NotFoundError('Workspace', input.workspace_id);
    }
    return workspace;
  }
}
