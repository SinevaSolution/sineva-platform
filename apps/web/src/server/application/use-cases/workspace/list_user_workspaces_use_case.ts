import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';

export interface ListUserWorkspacesInput {
  user_id: string;
}

export class ListUserWorkspacesUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(
    input: ListUserWorkspacesInput,
  ): Promise<Array<{ workspace: WorkspaceEntity; role: string }>> {
    return this.workspaceRepo.listForUser(input.user_id);
  }
}
