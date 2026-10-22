import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { VaultUnavailableError } from '@/server/domain/vault/vault';
import { validateEnvConfig } from '@/server/infrastructure/config/env';
import { resolveVaultDatabaseUrl } from '@/server/infrastructure/database/prisma_client';

// ADR-0036, ADR-0037: vault and provider credentials are optional at boot (a
// provider without credentials is listed as unavailable) but a development
// default KEK never passes in production.

const BASE = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:pw@localhost:5432/db_test',
  S3_ACCESS_KEY_ID: 'a',
  S3_SECRET_ACCESS_KEY: 'b',
  AI_ENGINE_INTERNAL_API_KEY: 'c',
  AUTH_SECRET: 'd',
  INTERNAL_CONTEXT_SIGNING_KEY: 'e',
};

const PROD = {
  ...BASE,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://prod_user:p7_xK9_SecureRealProdPw@postgres.prod:5432/sineva_platform',
  REDIS_URL: 'redis://redis.prod:6379/0',
  S3_ENDPOINT: 'https://s3.internal.sineva.com',
  S3_PUBLIC_ENDPOINT: 'https://s3.sineva.com',
  S3_ACCESS_KEY_ID: 'AKIA_PROD_S3_KEY_REAL',
  S3_SECRET_ACCESS_KEY: 's3_prod_secret_key_long_and_complex_12345',
  AI_ENGINE_INTERNAL_URL: 'http://sineva-ai:8000',
  AI_ENGINE_INTERNAL_API_KEY: 'snv_ai_prod_key_77a98c11bf882d9e',
  AUTH_SECRET: 'auth_secret_must_be_at_least_32_characters_long_real',
  INTERNAL_CONTEXT_SIGNING_KEY: '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgprod...',
  INTERNAL_CONTEXT_KID: 'k1',
};

const kek = (id: string) => `${id}:${randomBytes(32).toString('base64')}`;

describe('vault database client selection (ADR-0036 decision 5)', () => {
  const base = { node_env: 'test', database_url: 'postgresql://app@h/db' };

  it('uses the vault url when set', () => {
    expect(resolveVaultDatabaseUrl({ ...base, vault_database_url: 'postgresql://vault@h/db' })).toBe(
      'postgresql://vault@h/db',
    );
  });

  it('shares the main url outside production', () => {
    expect(resolveVaultDatabaseUrl(base)).toBe(base.database_url);
  });

  it('refuses to fall back to the application role in production', () => {
    expect(() => resolveVaultDatabaseUrl({ ...base, node_env: 'production' })).toThrow(VaultUnavailableError);
  });
});

describe('connection layer environment (WP-M2-05, WP-M2-09)', () => {
  it('boots with no vault or provider variables and leaves them undefined', () => {
    const config = validateEnvConfig(BASE);
    expect(config.vault_local_kek).toBeUndefined();
    expect(config.vault_database_url).toBeUndefined();
    expect(config.google_connect_client_id).toBeUndefined();
    expect(config.notion_client_secret).toBeUndefined();
  });

  it('reads provider connection credentials, separate from the sign-in variables', () => {
    const config = validateEnvConfig({
      ...BASE,
      GOOGLE_CLIENT_ID: 'signin-id',
      GOOGLE_CONNECT_CLIENT_ID: 'connect-id',
      GOOGLE_CONNECT_CLIENT_SECRET: 'connect-secret',
      NOTION_CLIENT_ID: 'n-id',
      NOTION_CLIENT_SECRET: 'n-secret',
    });
    expect(config.google_client_id).toBe('signin-id');
    expect(config.google_connect_client_id).toBe('connect-id');
    expect(config.google_connect_client_secret).toBe('connect-secret');
    expect(config.notion_client_id).toBe('n-id');
    expect(config.notion_client_secret).toBe('n-secret');
  });

  it('treats blank provider variables as not set', () => {
    const config = validateEnvConfig({ ...BASE, GOOGLE_CONNECT_CLIENT_ID: '  ', NOTION_CLIENT_ID: '' });
    expect(config.google_connect_client_id).toBeUndefined();
    expect(config.notion_client_id).toBeUndefined();
  });

  it('defaults the KMS provider to local and rejects an unknown one', () => {
    expect(validateEnvConfig(BASE).vault_kms_provider).toBe('local');
    expect(validateEnvConfig({ ...BASE, VAULT_KMS_PROVIDER: 'cloud' }).vault_kms_provider).toBe('cloud');
    expect(() => validateEnvConfig({ ...BASE, VAULT_KMS_PROVIDER: 'magic' })).toThrow(/VAULT_KMS_PROVIDER/);
  });

  it('refuses a development default vault key in production, at startup', () => {
    expect(() => validateEnvConfig({ ...PROD, VAULT_LOCAL_KEK: kek('dev-local-1') })).toThrow(
      /VAULT_LOCAL_KEK.*development default/,
    );
    expect(() => validateEnvConfig({ ...PROD, VAULT_LOCAL_KEK: kek('prod-2026-10') })).not.toThrow();
  });

  it('accepts a development vault key outside production', () => {
    expect(validateEnvConfig({ ...BASE, VAULT_LOCAL_KEK: kek('dev-local-1') }).vault_local_kek).toMatch(/^dev-local-1:/);
  });

  it('refuses a vault database url that equals the application url in production', () => {
    expect(() => validateEnvConfig({ ...PROD, VAULT_DATABASE_URL: PROD.DATABASE_URL })).toThrow(
      /VAULT_DATABASE_URL must use a different role/,
    );
    expect(() =>
      validateEnvConfig({
        ...PROD,
        VAULT_DATABASE_URL: 'postgresql://sineva_vault:p7_xK9_VaultRoleRealPw@postgres.prod:5432/sineva_platform',
      }),
    ).not.toThrow();
  });
});
