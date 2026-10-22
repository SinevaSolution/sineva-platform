import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ModeEntitlementService } from '@/server/application/entitlements/mode_entitlement_service';
import {
  ENTITLEMENT_KEYS,
  EntitlementRequiredError,
  isEntitlementKey,
  type EntitlementLimit,
  type EntitlementLimitProvider,
} from '@/server/domain/entitlements/entitlements';
import { CreateWorkspaceUseCase } from '@/server/application/use-cases/workspace/create_workspace_use_case';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { validateEnvConfig } from '@/server/infrastructure/config/env';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';

const WS = '11111111-1111-4111-8111-111111111111';

function provider(limits: Record<string, EntitlementLimit | null> = {}): EntitlementLimitProvider {
  return { resolve: async (_workspaceId, key) => limits[key] ?? null };
}

function service(
  mode: 'open' | 'shadow' | 'enforced',
  limits: Record<string, EntitlementLimit | null> = {},
) {
  const events: Array<Record<string, unknown>> = [];
  const svc = new ModeEntitlementService(mode, provider(limits), (event) => events.push(event));
  return { svc, events };
}

describe('EntitlementService.numericLimit (ADR-0033)', () => {
  it('is null in open mode, whatever the provider holds, and logs nothing', async () => {
    const { svc, events } = service('open', { 'library.storage_mb': { limit: 500 } });
    expect(await svc.numericLimit(WS, ENTITLEMENT_KEYS.STORAGE_MB)).toBeNull();
    expect(events).toEqual([]);
  });

  it('returns the ceiling of a counted key, and null for a feature flag or a missing entry', async () => {
    const { svc } = service('enforced', { 'library.storage_mb': { limit: 500 }, 'squads.enabled': { limit: true } });
    expect(await svc.numericLimit(WS, ENTITLEMENT_KEYS.STORAGE_MB)).toBe(500);
    expect(await svc.numericLimit(WS, ENTITLEMENT_KEYS.SQUADS)).toBeNull();
    expect(await svc.numericLimit(WS, ENTITLEMENT_KEYS.DOCUMENTS)).toBeNull();
  });
});

describe('EntitlementService.check (FR-BILL-34, FR-AUTH-33)', () => {
  it('open mode always allows and logs entitlement.checked', async () => {
    const { svc, events } = service('open');

    const result = await svc.check(WS, ENTITLEMENT_KEYS.MEMBERS, 500);

    expect(result.allowed).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({
        event: 'entitlement.checked',
        mode: 'open',
        workspace_id: WS,
        key: 'members.max',
        allowed: true,
      }),
    ]);
  });

  it('shadow mode logs entitlement.would_block for a failing check and still allows', async () => {
    const { svc, events } = service('shadow', {
      'members.max': { limit: 3, plan_required: 'team' },
    });

    const result = await svc.check(WS, ENTITLEMENT_KEYS.MEMBERS, 5);

    expect(result).toMatchObject({ allowed: true, plan_required: 'team' });
    expect(events.map((e) => e.event)).toEqual(['entitlement.would_block']);
    expect(events[0]).toMatchObject({ key: 'members.max', plan_required: 'team', quantity: 5 });
  });

  it('shadow mode logs checked (not would_block) for a passing check', async () => {
    const { svc, events } = service('shadow', { 'members.max': { limit: 10 } });

    await svc.check(WS, ENTITLEMENT_KEYS.MEMBERS, 5);

    expect(events.map((e) => e.event)).toEqual(['entitlement.checked']);
  });

  it('enforced mode blocks a failing check with a typed 403 entitlement_required', async () => {
    const { svc } = service('enforced', { 'members.max': { limit: 3, plan_required: 'team' } });

    const result = await svc.check(WS, ENTITLEMENT_KEYS.MEMBERS, 5);
    expect(result).toMatchObject({ allowed: false, plan_required: 'team' });

    const error = await svc.assert(WS, ENTITLEMENT_KEYS.MEMBERS, 5).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EntitlementRequiredError);
    expect(error).toMatchObject({ status: 403, code: 'entitlement_required' });
  });

  it('enforced mode allows within the limit and boolean entitlements that are on', async () => {
    const { svc } = service('enforced', {
      'members.max': { limit: 10 },
      'squads.enabled': { limit: true },
    });

    expect((await svc.check(WS, ENTITLEMENT_KEYS.MEMBERS, 10)).allowed).toBe(true);
    expect((await svc.check(WS, ENTITLEMENT_KEYS.SQUADS)).allowed).toBe(true);
    await expect(svc.assert(WS, ENTITLEMENT_KEYS.MEMBERS, 10)).resolves.toBeUndefined();
  });

  it('enforced mode denies a key with no entitlement defined for the workspace', async () => {
    const { svc } = service('enforced');

    expect((await svc.check(WS, ENTITLEMENT_KEYS.ROUTINES)).allowed).toBe(false);
  });

  it('a per-workspace override from the provider wins (interface support, unused until M4)', async () => {
    const overrides: EntitlementLimitProvider = {
      resolve: async (workspaceId, key) =>
        workspaceId === WS && key === 'members.max' ? { limit: 100 } : { limit: 1 },
    };
    const svc = new ModeEntitlementService('enforced', overrides, () => undefined);

    expect((await svc.check(WS, ENTITLEMENT_KEYS.MEMBERS, 50)).allowed).toBe(true);
    expect((await svc.check('22222222-2222-4222-8222-222222222222', ENTITLEMENT_KEYS.MEMBERS, 50)).allowed).toBe(false);
  });

  it('rejects unknown keys in every mode', async () => {
    for (const mode of ['open', 'shadow', 'enforced'] as const) {
      const { svc } = service(mode);
      await expect(svc.check(WS, 'made.up.key' as never)).rejects.toThrow(/unknown entitlement key/i);
    }
  });

  it('only registered keys pass isEntitlementKey', () => {
    expect(isEntitlementKey('members.max')).toBe(true);
    expect(isEntitlementKey('members')).toBe(false);
    expect(Object.values(ENTITLEMENT_KEYS)).toEqual(
      expect.arrayContaining([
        'members.max',
        'workspaces.owned.max',
        'library.storage_mb',
        'library.documents.max',
        'library.ocr_pages.monthly',
        'specialists.wave2',
        'connections.max',
        'routines.max',
        'workflows.max',
        'squads.enabled',
      ]),
    );
  });
});

describe('workspace creation calls the entitlement check', () => {
  const repo = {
    slugExists: async () => false,
    create: async () => {
      throw new Error('should not be reached in enforced denial');
    },
  } as unknown as WorkspaceRepository;

  it('checks workspaces.owned.max before creating', async () => {
    const asked: Array<[string | null, string, number | undefined]> = [];
    const entitlements = {
      check: async () => ({ allowed: true, reason: 'open' }),
      assert: async (workspaceId: string | null, key: string, quantity?: number) => {
        asked.push([workspaceId, key, quantity]);
      },
      numericLimit: async () => null,
    };
    const created = {
      id: WS,
      workspace_slug: 'acme',
      subscription_tier: 'growth',
    };
    const okRepo = { ...repo, create: async () => created } as unknown as WorkspaceRepository;

    await new CreateWorkspaceUseCase(okRepo, new CountingAuditLogger(), entitlements).execute({
      workspace_name: 'Acme',
      owner_user_id: 'usr-1',
    });

    expect(asked).toEqual([[null, 'workspaces.owned.max', undefined]]);
  });

  it('does not create the workspace when enforcement denies it', async () => {
    const { svc } = service('enforced');

    await expect(
      new CreateWorkspaceUseCase(repo, new CountingAuditLogger(), svc).execute({
        workspace_name: 'Acme',
        owner_user_id: 'usr-1',
      }),
    ).rejects.toBeInstanceOf(EntitlementRequiredError);
  });
});

describe('ENTITLEMENTS_MODE validation at startup (WP-M0-09 rules)', () => {
  // Development values come from .env.example, as in the secrets tests: the
  // code carries no defaults for secrets.
  const example = parseEnv(
    readFileSync(resolve(import.meta.dirname, '../../../../.env.example'), 'utf8'),
  ) as Record<string, string>;
  const dev: Record<string, string | undefined> = { ...example, NODE_ENV: 'development' };
  delete dev.ENTITLEMENTS_MODE;

  it('defaults to open', () => {
    expect(validateEnvConfig(dev).entitlements_mode).toBe('open');
  });

  it('accepts the three modes in development', () => {
    for (const mode of ['open', 'shadow', 'enforced']) {
      expect(validateEnvConfig({ ...dev, ENTITLEMENTS_MODE: mode }).entitlements_mode).toBe(mode);
    }
  });

  it('rejects an unknown mode', () => {
    expect(() => validateEnvConfig({ ...dev, ENTITLEMENTS_MODE: 'free' })).toThrow(/ENTITLEMENTS_MODE/);
  });

  const prodBase = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://prod_user:p7_xK9_SecureRealProdPw@postgres.prod:5432/sineva_platform',
    REDIS_URL: 'redis://redis.prod:6379/0',
    REDIS_KEY_PREFIX: 'sineva:platform:',
    S3_ENDPOINT: 'https://s3.internal.sineva.com',
    S3_PUBLIC_ENDPOINT: 'https://s3.sineva.com',
    S3_REGION: 'ap-southeast-3',
    S3_ACCESS_KEY_ID: 'AKIA_PROD_S3_KEY_REAL',
    S3_SECRET_ACCESS_KEY: 's3_prod_secret_key_long_and_complex_12345',
    S3_BUCKET_NAME: 'sineva-production-assets',
    S3_FORCE_PATH_STYLE: 'true',
    AI_ENGINE_INTERNAL_URL: 'http://sineva-ai:8000',
    AI_ENGINE_INTERNAL_API_KEY: 'snv_ai_prod_key_77a98c11bf882d9e',
    AI_ENGINE_TIMEOUT_MS: '15000',
    AUTH_SECRET: 'auth_secret_must_be_at_least_32_characters_long_real',
    INTERNAL_CONTEXT_SIGNING_KEY: '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgprod...',
    INTERNAL_CONTEXT_KID: 'k1',
  };

  it('production defaults to open', () => {
    expect(validateEnvConfig(prodBase).entitlements_mode).toBe('open');
  });

  it('refuses enforced in production without the explicit override', () => {
    expect(() => validateEnvConfig({ ...prodBase, ENTITLEMENTS_MODE: 'enforced' })).toThrow(
      /ENTITLEMENTS_ALLOW_ENFORCED/,
    );
  });

  it('allows enforced in production with the override', () => {
    const cfg = validateEnvConfig({
      ...prodBase,
      ENTITLEMENTS_MODE: 'enforced',
      ENTITLEMENTS_ALLOW_ENFORCED: 'true',
    });
    expect(cfg.entitlements_mode).toBe('enforced');
  });
});
