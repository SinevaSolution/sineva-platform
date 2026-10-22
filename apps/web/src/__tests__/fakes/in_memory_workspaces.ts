import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceRepository,
} from '@/server/domain/repositories/workspace_repository';

/** Workspace repository with unique ids and per-user memberships (owner by default). */
export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  workspaces = new Map<string, WorkspaceEntity>();
  /** user id to workspace ids, besides ownership. */
  memberOf = new Map<string, Set<string>>();
  private seq = 0;

  async findById(id: string) {
    return this.workspaces.get(id) ?? null;
  }

  async findBySlug(slug: string) {
    return [...this.workspaces.values()].find((w) => w.workspace_slug === slug) ?? null;
  }

  async listForUser(userId: string) {
    return [...this.workspaces.values()]
      .filter((w) => w.owner_user_id === userId || this.memberOf.get(userId)?.has(w.id))
      .map((workspace) => ({ workspace, role: workspace.owner_user_id === userId ? 'owner' : 'member' }));
  }

  async create(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    this.seq += 1;
    const id = `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
    const workspace: WorkspaceEntity = {
      id,
      workspace_name: input.workspace_name,
      workspace_slug: input.workspace_slug,
      owner_user_id: input.owner_user_id,
      status: 'active',
      status_reason: null,
      trial_ends_at: null,
      timezone: input.timezone ?? 'Asia/Jakarta',
      default_locale: input.default_locale ?? 'id',
      logo_url: input.logo_url ?? null,
      slug_changed_at: null,
      subscription_tier: 'growth',
      monthly_token_quota: 1000000,
      monthly_tokens_consumed: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  async update(id: string, input: UpdateWorkspaceInput): Promise<WorkspaceEntity> {
    const existing = this.workspaces.get(id);
    if (!existing) throw new NotFoundError('Workspace', id);
    const { slug_changed_at, ...rest } = input;
    const updated: WorkspaceEntity = {
      ...existing,
      ...rest,
      slug_changed_at: slug_changed_at ? slug_changed_at.toISOString() : existing.slug_changed_at,
    };
    this.workspaces.set(id, updated);
    return updated;
  }

  async slugExists(slug: string) {
    return (await this.findBySlug(slug)) !== null;
  }
}
