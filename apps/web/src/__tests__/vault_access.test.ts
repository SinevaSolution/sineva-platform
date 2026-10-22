import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-0036 decision 6 and plan gate G4: the application code path never reads
// the vault table outside the credential resolver. Static, so it fails the
// moment someone adds a second reader instead of when a role grant changes.

const SRC_ROOT = resolve(import.meta.dirname, '..');
const WEB_ROOT = resolve(SRC_ROOT, '..');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const productionFiles = walk(SRC_ROOT)
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !file.includes('/__tests__/') && !file.includes('/database/generated/'))
  .map((file) => ({
    rel: relative(SRC_ROOT, file).split('\\').join('/'),
    code: stripComments(readFileSync(file, 'utf8')),
  }));

function filesMatching(pattern: RegExp): string[] {
  return productionFiles.filter((file) => pattern.test(file.code)).map((file) => file.rel).sort();
}

describe('vault access (G4, ADR-0036)', () => {
  it('only the vault repository names the vault table or its Prisma delegate', () => {
    expect(filesMatching(/vault_secrets|\.vaultSecret\b/)).toEqual([
      'server/infrastructure/database/prisma_vault_secret_repository.ts',
    ]);
  });

  it('only the vault repository and the container build on the vault database client', () => {
    expect(filesMatching(/getVaultPrismaClient/)).toEqual([
      'server/container.ts',
      'server/infrastructure/database/prisma_client.ts',
    ]);
  });

  it('only the vault service, the credential resolver and the container touch SecretReader', () => {
    expect(filesMatching(/\bSecretReader\b/)).toEqual([
      'server/application/connections/credential_resolver.ts',
      'server/domain/vault/vault.ts',
      'server/infrastructure/vault/vault_service.ts',
    ]);
  });

  it('only the container constructs the VaultService', () => {
    expect(filesMatching(/new VaultService\(/)).toEqual(['server/container.ts']);
  });

  it('the container exports no getter that returns the read half of the vault', () => {
    const container = productionFiles.find((file) => file.rel === 'server/container.ts')!;
    expect(container.code).not.toMatch(/export const getSecretReader/);
    expect(container.code).not.toMatch(/export const getVaultService/);
    expect(container.code).not.toMatch(/export \{[^}]*getVaultService/);
  });

  it('nothing outside the vault code decrypts: no use case or route imports the envelope helpers', () => {
    const offenders = productionFiles
      .filter((file) => /envelope_crypto/.test(file.code))
      .map((file) => file.rel)
      .sort();
    expect(offenders).toEqual(['server/infrastructure/vault/vault_service.ts']);
  });

  it('the operator role script revokes the application role and grants the vault role only', () => {
    const sql = readFileSync(join(WEB_ROOT, 'prisma/ops/vault_roles.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).toMatch(/REVOKE ALL ON TABLE platform\.vault_secrets FROM :"app_role"/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE platform\.vault_secrets FROM PUBLIC/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform\.vault_secrets TO :"vault_role"/);
    // The application role is never granted anything on the table.
    expect(sql).not.toMatch(/GRANT[^;]*vault_secrets[^;]*TO :"app_role"/);
  });

  it('no Prisma migration creates or alters roles (they are an operator step)', () => {
    const migrations = walk(join(WEB_ROOT, 'prisma/migrations')).filter((file) => file.endsWith('.sql'));
    expect(migrations.length).toBeGreaterThan(0);
    const offenders = migrations
      .filter((file) => /\b(CREATE|ALTER|DROP)\s+ROLE\b|\bGRANT\b[^;]*\bTO\b/i.test(stripSqlComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(WEB_ROOT, file));
    expect(offenders).toEqual([]);
  });
});

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}
