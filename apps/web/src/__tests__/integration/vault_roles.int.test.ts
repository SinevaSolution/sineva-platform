import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';

// G4: the web (application) role cannot read the vault table, the vault role can.
//
// This test creates and drops database ROLES, which are cluster-wide objects,
// so it runs only when ALLOW_ROLE_DDL=true is set deliberately and the cluster
// behind TEST_DATABASE_URL is a disposable one. It never runs by accident
// against the shared development cluster.
const enabled = process.env.ALLOW_ROLE_DDL === 'true';

const SCRIPT = readFileSync(resolve(import.meta.dirname, '../../../prisma/ops/vault_roles.sql'), 'utf8');

const ROLES = { owner: 'itest_vault_owner', app: 'itest_vault_app', vault: 'itest_vault_vault' };
const PASSWORD = 'itest-only-password';

function urlFor(role: string): string {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.username = role;
  url.password = PASSWORD;
  return url.toString();
}

/** Runs the operator script with its psql variables substituted, statement by statement. */
function scriptStatements(): string[] {
  return SCRIPT.split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/:"owner_role"/g, `"${ROLES.owner}"`)
    .replace(/:"app_role"/g, `"${ROLES.app}"`)
    .replace(/:"vault_role"/g, `"${ROLES.vault}"`)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

describe.skipIf(!enabled)('vault database roles (G4, ADR-0036 decision 5)', () => {
  const admin = createPrismaClient(process.env.TEST_DATABASE_URL!);
  let workspaceId = '';
  let appDb: ReturnType<typeof createPrismaClient>;
  let vaultDb: ReturnType<typeof createPrismaClient>;

  beforeAll(async () => {
    for (const role of Object.values(ROLES)) {
      await admin.$executeRawUnsafe(`DROP OWNED BY "${role}"`).catch(() => undefined);
      await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS "${role}"`);
      await admin.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${PASSWORD}'`);
    }
    // What a typical deployment already has before the script runs: the app
    // role was granted everything in the schema when the tables were created.
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA platform TO "${ROLES.app}"`);
    await admin.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA platform TO "${ROLES.app}"`);
    for (const statement of scriptStatements()) {
      await admin.$executeRawUnsafe(statement);
    }
    const workspace = await admin.workspace.create({ data: { workspace_slug: 'roles-a', workspace_name: 'Roles' } });
    workspaceId = workspace.id;
    appDb = createPrismaClient(urlFor(ROLES.app));
    vaultDb = createPrismaClient(urlFor(ROLES.vault));
  });

  afterAll(async () => {
    await appDb?.$disconnect();
    await vaultDb?.$disconnect();
    await admin.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM "${ROLES.app}"`).catch(() => undefined);
    await admin.$executeRawUnsafe(`ALTER TABLE platform.vault_secrets OWNER TO CURRENT_USER`).catch(() => undefined);
    for (const role of Object.values(ROLES)) {
      await admin.$executeRawUnsafe(`DROP OWNED BY "${role}"`).catch(() => undefined);
      await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS "${role}"`).catch(() => undefined);
    }
    await admin.$disconnect();
  });

  it('the application role cannot SELECT, INSERT, UPDATE or DELETE vault_secrets', async () => {
    const ownerId = '55555555-5555-4555-8555-555555555555';
    await expect(appDb.$queryRawUnsafe('SELECT * FROM "platform"."vault_secrets"')).rejects.toThrow(/permission denied/i);
    await expect(
      appDb.$executeRawUnsafe(
        `INSERT INTO "platform"."vault_secrets" ("owner_type","owner_id","workspace_id","provider_id","ciphertext","nonce","dek_wrapped","kek_id") VALUES ('connection','${ownerId}','${workspaceId}','x','\\x00','\\x00','\\x00','k')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(appDb.$executeRawUnsafe('UPDATE "platform"."vault_secrets" SET "kek_id" = \'k\'')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(appDb.$executeRawUnsafe('DELETE FROM "platform"."vault_secrets"')).rejects.toThrow(/permission denied/i);
  });

  it('the application role still reads the other platform tables', async () => {
    await expect(appDb.$queryRawUnsafe('SELECT count(*) FROM "platform"."connections"')).resolves.toBeDefined();
  });

  it('the vault role reads and writes the vault table and nothing else', async () => {
    const ownerId = '66666666-6666-4666-8666-666666666666';
    // The shared reset hook truncates workspaces before every test.
    const workspace = await admin.workspace.create({ data: { workspace_slug: 'roles-b', workspace_name: 'Roles B' } });
    workspaceId = workspace.id;
    await vaultDb.$executeRawUnsafe(
      `INSERT INTO "platform"."vault_secrets" ("owner_type","owner_id","workspace_id","provider_id","ciphertext","nonce","dek_wrapped","kek_id") VALUES ('connection','${ownerId}','${workspaceId}','x','\\x01','\\x02','\\x03','k')`,
    );
    const rows = await vaultDb.$queryRawUnsafe<Array<{ kek_id: string }>>('SELECT "kek_id" FROM "platform"."vault_secrets"');
    expect(rows).toHaveLength(1);
    await vaultDb.$executeRawUnsafe('DELETE FROM "platform"."vault_secrets"');
    await expect(vaultDb.$queryRawUnsafe('SELECT * FROM "platform"."connections"')).rejects.toThrow(/permission denied/i);
    await expect(vaultDb.$queryRawUnsafe('SELECT * FROM "platform"."users"')).rejects.toThrow(/permission denied/i);
  });

  it('the table is not owned by the application role (an owner keeps its privileges)', async () => {
    const rows = await admin.$queryRawUnsafe<Array<{ owner: string }>>(
      `SELECT tableowner AS owner FROM pg_tables WHERE schemaname = 'platform' AND tablename = 'vault_secrets'`,
    );
    expect(rows[0]?.owner).toBe(ROLES.owner);
    expect(rows[0]?.owner).not.toBe(ROLES.app);
  });
});
