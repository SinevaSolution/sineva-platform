import type { WorkspaceEntity } from '../entities/workspace';

export interface CreateWorkspaceInput {
  workspace_name: string;
  workspace_slug: string;
  owner_user_id: string;
  default_locale?: string;
  timezone?: string;
  logo_url?: string | null;
}

export interface UpdateWorkspaceInput {
  workspace_name?: string;
  workspace_slug?: string;
  logo_url?: string | null;
  default_locale?: string;
  timezone?: string;
  slug_changed_at?: Date | null;
}

export interface WorkspaceRepository {
  findById(id: string): Promise<WorkspaceEntity | null>;
  findBySlug(slug: string): Promise<WorkspaceEntity | null>;
  listForUser(userId: string): Promise<Array<{ workspace: WorkspaceEntity; role: string }>>;
  create(input: CreateWorkspaceInput): Promise<WorkspaceEntity>;
  update(id: string, input: UpdateWorkspaceInput): Promise<WorkspaceEntity>;
  slugExists(slug: string): Promise<boolean>;
}
