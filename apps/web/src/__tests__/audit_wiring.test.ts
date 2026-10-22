import { describe, expect, it, beforeEach } from 'vitest';
import { RepositoryAuditLogger } from '@/server/application/audit/repository_audit_logger';
import { CreateWorkspaceUseCase } from '@/server/application/use-cases/workspace/create_workspace_use_case';
import { UpdateProfileUseCase } from '@/server/application/use-cases/profile/update_profile_use_case';
import { RotateSigningKeyUseCase } from '@/server/application/use-cases/security/rotate_signing_key_use_case';
import { CountingAuditLogger, type AuditLogger } from '@/server/domain/audit/audit_logger';
import type { SigningKeyEntity } from '@/server/domain/entities/signing_key';
import type { WorkspaceEntity } from '@/server/domain/entities/workspace';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceRepository,
} from '@/server/domain/repositories/workspace_repository';
import type { SigningKeyRepository } from '@/server/domain/repositories/signing_key_repository';
import { allowAllEntitlements } from './fakes/allow_all_entitlements';
import { FakeAuditEventRepository } from './fakes/fake_audit_event_repository';
import { FakeTransactionRunner } from './fakes/fake_transaction_runner';
import { buildUserProfile, FakeUserProfileRepository } from './fakes/fake_user_profile_repository';

const WS_ID = '123e4567-e89b-12d3-a456-426614174000';

class TransactionalFakeWorkspaceRepository implements WorkspaceRepository {
  readonly workspaces = new Map<string, WorkspaceEntity>();
  constructor(private readonly tx: FakeTransactionRunner) {}

  async findById(id: string) {
    return this.workspaces.get(id) ?? null;
  }
  async findBySlug() {
    return null;
  }
  async listForUser() {
    return [];
  }
  async slugExists(slug: string) {
    return [...this.workspaces.values()].some((w) => w.workspace_slug === slug);
  }
  async update(id: string, input: UpdateWorkspaceInput): Promise<WorkspaceEntity> {
    const existing = this.workspaces.get(id)!;
    const updated = { ...existing, ...input, slug_changed_at: existing.slug_changed_at };
    this.workspaces.set(id, updated);
    return updated;
  }
  async create(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    const ws: WorkspaceEntity = {
      id: WS_ID,
      workspace_name: input.workspace_name,
      workspace_slug: input.workspace_slug,
      owner_user_id: input.owner_user_id,
      status: 'active',
      status_reason: null,
      trial_ends_at: null,
      timezone: 'Asia/Jakarta',
      default_locale: 'id',
      logo_url: null,
      slug_changed_at: null,
      subscription_tier: 'growth',
      monthly_token_quota: 1,
      monthly_tokens_consumed: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workspaces.set(ws.id, ws);
    this.tx.onRollback(() => this.workspaces.delete(ws.id));
    return ws;
  }
}

describe('RepositoryAuditLogger (FR-SEC-31, FR-SEC-33)', () => {
  it('appends a redacted row for each event', async () => {
    const repo = new FakeAuditEventRepository();
    const logger = new RepositoryAuditLogger(repo);

    await logger.log({
      action: 'workspace.updated',
      context: {
        user_id: 'usr-1',
        workspace_id: WS_ID,
        session_id: 's',
        request_id: 'req-1',
        actor: { type: 'user', id: 'usr-1' },
        ip: '198.51.100.9',
      },
      target_resource_id: WS_ID,
      target_resource_type: 'workspace',
      metadata: { content: 'private' },
    });

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      workspace_id: WS_ID,
      action: 'workspace.updated',
      ip: '198.51.100.0',
      metadata: { content: '[redacted]' },
    });
  });

  it('rejects when the write fails, so the privileged action cannot report success', async () => {
    const repo = new FakeAuditEventRepository();
    repo.failWith = new Error('audit store down');
    const logger = new RepositoryAuditLogger(repo);

    await expect(
      logger.log({
        action: 'user.signed_in',
        context: { user_id: 'u', session_id: 's', request_id: 'r' },
      }),
    ).rejects.toThrow('audit store down');
  });
});

describe('CreateWorkspaceUseCase audit write is atomic with the action (FR-SEC data integrity)', () => {
  let tx: FakeTransactionRunner;
  let repo: TransactionalFakeWorkspaceRepository;
  const failingLogger: AuditLogger = {
    log: async () => {
      throw new Error('audit insert failed');
    },
  };

  beforeEach(() => {
    tx = new FakeTransactionRunner();
    repo = new TransactionalFakeWorkspaceRepository(tx);
  });

  it('rolls the workspace back when the audit write fails', async () => {
    const useCase = new CreateWorkspaceUseCase(repo, failingLogger, allowAllEntitlements, tx);

    await expect(
      useCase.execute({ workspace_name: 'Acme', workspace_slug: 'acme', owner_user_id: 'usr-1' }),
    ).rejects.toThrow('audit insert failed');

    expect(repo.workspaces.size).toBe(0);
    expect(tx.rollbacks).toBe(1);
  });

  it('keeps the workspace and the audit event when both succeed', async () => {
    const logger = new CountingAuditLogger();
    const useCase = new CreateWorkspaceUseCase(repo, logger, allowAllEntitlements, tx);

    await useCase.execute({ workspace_name: 'Acme', workspace_slug: 'acme', owner_user_id: 'usr-1' });

    expect(repo.workspaces.size).toBe(1);
    expect(tx.rollbacks).toBe(0);
    expect(logger.getEvents().map((e) => e.action)).toEqual(['workspace.created']);
  });
});

describe('UpdateProfileUseCase audits user.profile_updated (PRD 01 auditable events)', () => {
  it('records changed field names and redacted before and after values', async () => {
    const profiles = new FakeUserProfileRepository();
    profiles.seed(buildUserProfile({ id: 'usr-1', full_name: 'Amira Putri', locale: 'id' }));
    const logger = new CountingAuditLogger();

    await new UpdateProfileUseCase(profiles, logger).execute({
      user_id: 'usr-1',
      full_name: 'Amira Lestari',
      locale: 'en',
    });

    const [event] = logger.getEvents();
    expect(event).toMatchObject({
      action: 'user.profile_updated',
      target_resource_type: 'user',
      target_resource_id: 'usr-1',
      metadata: { changed_fields: ['full_name', 'locale'] },
      change: {
        before: { full_name: 'Amira Putri', locale: 'id' },
        after: { full_name: 'Amira Lestari', locale: 'en' },
      },
    });
  });

  it('does not write an audit event when the user does not exist', async () => {
    const logger = new CountingAuditLogger();

    await expect(
      new UpdateProfileUseCase(new FakeUserProfileRepository(), logger).execute({
        user_id: 'missing',
        full_name: 'X',
      }),
    ).rejects.toThrow();

    expect(logger.getEventCount()).toBe(0);
  });
});

describe('RotateSigningKeyUseCase emits signing_key.rotated (PRD 01, security PRD)', () => {
  const key: SigningKeyEntity = {
    id: '11111111-1111-4111-8111-111111111111',
    kid: 'k20261101_01',
    alg: 'EdDSA',
    public_key: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    status: 'next',
    purpose: 'context',
    valid_from: '2026-11-01T00:00:00.000Z',
    valid_until: '2027-02-01T00:00:00.000Z',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };

  function fakeKeys(onRotate: () => void): SigningKeyRepository {
    return {
      findActiveKey: async () => null,
      findByKid: async () => null,
      listValidPublicKeys: async () => [],
      save: async () => undefined,
      rotate: async () => onRotate(),
    };
  }

  it('rotates and audits ids only, never key material', async () => {
    const logger = new CountingAuditLogger();
    let rotated = false;
    const useCase = new RotateSigningKeyUseCase(
      fakeKeys(() => {
        rotated = true;
      }),
      logger,
      new FakeTransactionRunner(),
    );

    await useCase.execute({ new_key: key, retire_kid: 'k20261021_01' });

    expect(rotated).toBe(true);
    const [event] = logger.getEvents();
    expect(event).toMatchObject({
      action: 'signing_key.rotated',
      target_resource_type: 'signing_key',
      target_resource_id: 'k20261101_01',
      metadata: { purpose: 'context', alg: 'EdDSA', retired_kid: 'k20261021_01' },
    });
    expect(JSON.stringify(event)).not.toContain('BEGIN PUBLIC KEY');
  });

  it('rolls the rotation back when the audit write fails', async () => {
    const tx = new FakeTransactionRunner();
    let state = 'before';
    const keys = fakeKeys(() => {
      state = 'after';
      tx.onRollback(() => {
        state = 'before';
      });
    });
    const failing: AuditLogger = {
      log: async () => {
        throw new Error('audit insert failed');
      },
    };

    await expect(new RotateSigningKeyUseCase(keys, failing, tx).execute({ new_key: key })).rejects.toThrow(
      'audit insert failed',
    );
    expect(state).toBe('before');
  });
});
