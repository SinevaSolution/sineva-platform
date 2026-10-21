import { describe, expect, it, beforeEach } from 'vitest';
import { CreateWorkspaceUseCase } from '@/server/application/use-cases/workspace/create_workspace_use_case';
import { GetWorkspaceUseCase } from '@/server/application/use-cases/workspace/get_workspace_use_case';
import { UpdateWorkspaceUseCase } from '@/server/application/use-cases/workspace/update_workspace_use_case';
import { ListUserWorkspacesUseCase } from '@/server/application/use-cases/workspace/list_user_workspaces_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { ValidationError, NotFoundError, ConflictError } from '@/server/domain/errors/domain_error';
import type { WorkspaceRepository, CreateWorkspaceInput, UpdateWorkspaceInput } from '@/server/domain/repositories/workspace_repository';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';

class FakeWorkspaceRepository implements WorkspaceRepository {
  public workspaces = new Map<string, WorkspaceEntity>();

  async findById(id: string): Promise<WorkspaceEntity | null> {
    return this.workspaces.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<WorkspaceEntity | null> {
    for (const ws of this.workspaces.values()) {
      if (ws.workspace_slug === slug) return ws;
    }
    return null;
  }

  async listForUser(userId: string): Promise<Array<{ workspace: WorkspaceEntity; role: string }>> {
    const results: Array<{ workspace: WorkspaceEntity; role: string }> = [];
    for (const ws of this.workspaces.values()) {
      if (ws.owner_user_id === userId) {
        results.push({ workspace: ws, role: 'owner' });
      }
    }
    return results;
  }

  async create(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    const ws: WorkspaceEntity = {
      id: '123e4567-e89b-12d3-a456-426614174000',
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
    this.workspaces.set(ws.id, ws);
    return ws;
  }

  async update(id: string, input: UpdateWorkspaceInput): Promise<WorkspaceEntity> {
    const existing = this.workspaces.get(id);
    if (!existing) throw new NotFoundError('Workspace', id);
    const updated: WorkspaceEntity = {
      ...existing,
      ...input,
      slug_changed_at: input.slug_changed_at
        ? input.slug_changed_at.toISOString()
        : input.slug_changed_at === null
          ? null
          : existing.slug_changed_at,
    };
    this.workspaces.set(id, updated);
    return updated;
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.findBySlug(slug)) !== null;
  }
}

describe('Workspace Use Cases (WP-M0-26, FR-AUTH-10, 11, 12, FR-SHELL-13)', () => {
  let workspaceRepo: FakeWorkspaceRepository;
  let auditLogger: CountingAuditLogger;

  beforeEach(() => {
    workspaceRepo = new FakeWorkspaceRepository();
    auditLogger = new CountingAuditLogger();
  });

  describe('CreateWorkspaceUseCase', () => {
    it('creates workspace and automatically derives clean slug', async () => {
      const useCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      const ws = await useCase.execute({
        workspace_name: 'PT. Maju Bersama',
        owner_user_id: '11111111-1111-4111-8111-111111111111',
      });

      expect(ws.workspace_name).toBe('PT. Maju Bersama');
      expect(ws.workspace_slug).toBe('pt-maju-bersama');
      expect(auditLogger.getEvents().some((e) => e.action === 'workspace.created')).toBe(true);
    });

    it('rejects reserved slug when specified explicitly (FR-SHELL-13)', async () => {
      const useCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      await expect(
        useCase.execute({
          workspace_name: 'Settings Corp',
          workspace_slug: 'settings',
          owner_user_id: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects duplicate slug when specified explicitly', async () => {
      const useCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      await useCase.execute({
        workspace_name: 'Acme',
        workspace_slug: 'acme-corp',
        owner_user_id: '11111111-1111-4111-8111-111111111111',
      });

      await expect(
        useCase.execute({
          workspace_name: 'Acme Duplicate',
          workspace_slug: 'acme-corp',
          owner_user_id: '22222222-2222-4222-8222-222222222222',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('UpdateWorkspaceUseCase & Slug Rename Once Rule (FR-SHELL-13)', () => {
    it('allows changing slug for the first time and records slug_changed_at', async () => {
      const createUseCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      const ws = await createUseCase.execute({
        workspace_name: 'Initial Name',
        owner_user_id: '11111111-1111-4111-8111-111111111111',
      });

      const updateUseCase = new UpdateWorkspaceUseCase(workspaceRepo, auditLogger);
      const updated = await updateUseCase.execute({
        workspace_id: ws.id,
        workspace_slug: 'brand-new-slug',
      });

      expect(updated.workspace_slug).toBe('brand-new-slug');
      expect(updated.slug_changed_at).not.toBeNull();
    });

    it('rejects second slug change attempt (FR-SHELL-13 editable once)', async () => {
      const createUseCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      const ws = await createUseCase.execute({
        workspace_name: 'Initial Name',
        owner_user_id: '11111111-1111-4111-8111-111111111111',
      });

      const updateUseCase = new UpdateWorkspaceUseCase(workspaceRepo, auditLogger);
      // First update succeeds
      await updateUseCase.execute({
        workspace_id: ws.id,
        workspace_slug: 'brand-new-slug',
      });

      // Second update fails
      await expect(
        updateUseCase.execute({
          workspace_id: ws.id,
          workspace_slug: 'another-new-slug',
        }),
      ).rejects.toThrow(/once/i);
    });
  });

  describe('GetWorkspaceUseCase', () => {
    it('returns workspace when valid id exists', async () => {
      const createUseCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      const ws = await createUseCase.execute({
        workspace_name: 'Alpha Inc',
        owner_user_id: '11111111-1111-4111-8111-111111111111',
      });

      const getUseCase = new GetWorkspaceUseCase(workspaceRepo);
      const found = await getUseCase.execute({ workspace_id: ws.id });
      expect(found.id).toBe(ws.id);
      expect(found.workspace_name).toBe('Alpha Inc');
    });

    it('throws NotFoundError when workspace does not exist', async () => {
      const getUseCase = new GetWorkspaceUseCase(workspaceRepo);
      await expect(
        getUseCase.execute({ workspace_id: '99999999-9999-4999-8999-999999999999' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('ListUserWorkspacesUseCase', () => {
    it('returns all workspaces belonging to user', async () => {
      const createUseCase = new CreateWorkspaceUseCase(workspaceRepo, auditLogger);
      await createUseCase.execute({
        workspace_name: 'First Workspace',
        owner_user_id: '11111111-1111-4111-8111-111111111111',
      });

      const listUseCase = new ListUserWorkspacesUseCase(workspaceRepo);
      const list = await listUseCase.execute({ user_id: '11111111-1111-4111-8111-111111111111' });
      expect(list).toHaveLength(1);
      expect(list[0]?.workspace.workspace_name).toBe('First Workspace');
    });
  });
});
