import 'server-only';
import type {
  SecretOwnerType,
  VaultSecretRepository,
  VaultSecretRow,
} from '@/server/domain/vault/vault';
import type { PrismaClient } from './generated/client';

// The only file in src that names the vault table (`vault_access.test.ts`
// enforces it). It must be constructed with the vault database client: in
// production that client connects as the vault role, the only role with any
// privilege on this table (ADR-0036). Nothing here joins a transaction scope:
// the vault role cannot see the application tables, so a vault write is its own
// statement by design.

interface Row {
  owner_type: string;
  owner_id: string;
  workspace_id: string;
  provider_id: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  dek_wrapped: Uint8Array;
  kek_id: string;
  key_version: number;
  version: number;
}

function toRow(row: Row): VaultSecretRow {
  return {
    owner_type: row.owner_type as SecretOwnerType,
    owner_id: row.owner_id,
    workspace_id: row.workspace_id,
    provider_id: row.provider_id,
    ciphertext: Buffer.from(row.ciphertext),
    nonce: Buffer.from(row.nonce),
    dek_wrapped: Buffer.from(row.dek_wrapped),
    kek_id: row.kek_id,
    key_version: row.key_version,
    version: row.version,
  };
}

export class PrismaVaultSecretRepository implements VaultSecretRepository {
  constructor(private readonly vaultDb: PrismaClient) {}

  async find(owner_type: SecretOwnerType, owner_id: string): Promise<VaultSecretRow | null> {
    const row = await this.vaultDb.vaultSecret.findUnique({
      where: { owner_type_owner_id: { owner_type, owner_id } },
    });
    return row ? toRow(row) : null;
  }

  async save(
    row: Omit<VaultSecretRow, 'version'>,
    expected_version?: number,
  ): Promise<{ saved: boolean; version: number }> {
    const now = new Date();
    if (expected_version !== undefined && expected_version > 0) {
      // Compare-and-swap on the row version. The workspace and provider must
      // match too, so a caller presenting another context updates nothing.
      const rows = await this.vaultDb.$queryRaw<Array<{ version: number }>>`
        UPDATE "platform"."vault_secrets"
        SET "ciphertext" = ${row.ciphertext}, "nonce" = ${row.nonce}, "dek_wrapped" = ${row.dek_wrapped},
            "kek_id" = ${row.kek_id}, "key_version" = ${row.key_version},
            "version" = "version" + 1, "updated_at" = ${now}
        WHERE "owner_type" = ${row.owner_type} AND "owner_id" = ${row.owner_id}::uuid
          AND "workspace_id" = ${row.workspace_id}::uuid AND "provider_id" = ${row.provider_id}
          AND "version" = ${expected_version}
        RETURNING "version"`;
      return rows[0] ? { saved: true, version: rows[0].version } : { saved: false, version: 0 };
    }

    if (expected_version === 0) {
      // Create only: succeeds when no row exists yet.
      const rows = await this.vaultDb.$queryRaw<Array<{ version: number }>>`
        INSERT INTO "platform"."vault_secrets"
          ("owner_type", "owner_id", "workspace_id", "provider_id", "ciphertext", "nonce", "dek_wrapped", "kek_id", "key_version", "version", "created_at", "updated_at")
        VALUES (${row.owner_type}, ${row.owner_id}::uuid, ${row.workspace_id}::uuid, ${row.provider_id},
                ${row.ciphertext}, ${row.nonce}, ${row.dek_wrapped}, ${row.kek_id}, ${row.key_version}, 1, ${now}, ${now})
        ON CONFLICT ("owner_type", "owner_id") DO NOTHING
        RETURNING "version"`;
      return rows[0] ? { saved: true, version: rows[0].version } : { saved: false, version: 0 };
    }

    // Upsert. The conflict branch only fires for the same workspace and
    // provider: a row id reused under another tenant is refused, never taken over.
    const rows = await this.vaultDb.$queryRaw<Array<{ version: number }>>`
      INSERT INTO "platform"."vault_secrets" AS v
        ("owner_type", "owner_id", "workspace_id", "provider_id", "ciphertext", "nonce", "dek_wrapped", "kek_id", "key_version", "version", "created_at", "updated_at")
      VALUES (${row.owner_type}, ${row.owner_id}::uuid, ${row.workspace_id}::uuid, ${row.provider_id},
              ${row.ciphertext}, ${row.nonce}, ${row.dek_wrapped}, ${row.kek_id}, ${row.key_version}, 1, ${now}, ${now})
      ON CONFLICT ("owner_type", "owner_id") DO UPDATE
        SET "ciphertext" = EXCLUDED."ciphertext", "nonce" = EXCLUDED."nonce", "dek_wrapped" = EXCLUDED."dek_wrapped",
            "kek_id" = EXCLUDED."kek_id", "key_version" = EXCLUDED."key_version",
            "version" = v."version" + 1, "updated_at" = EXCLUDED."updated_at"
        WHERE v."workspace_id" = EXCLUDED."workspace_id" AND v."provider_id" = EXCLUDED."provider_id"
      RETURNING "version"`;
    return rows[0] ? { saved: true, version: rows[0].version } : { saved: false, version: 0 };
  }

  async delete(owner_type: SecretOwnerType, owner_id: string): Promise<void> {
    await this.vaultDb.vaultSecret.deleteMany({ where: { owner_type, owner_id } });
  }

  async listNotWrappedBy(kek_id: string, limit: number): Promise<VaultSecretRow[]> {
    const rows = await this.vaultDb.vaultSecret.findMany({
      where: { kek_id: { not: kek_id } },
      take: limit,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(toRow);
  }

  async rewrap(
    row: Pick<VaultSecretRow, 'owner_type' | 'owner_id' | 'dek_wrapped' | 'kek_id' | 'key_version'>,
    version: number,
  ): Promise<boolean> {
    const result = await this.vaultDb.vaultSecret.updateMany({
      where: { owner_type: row.owner_type, owner_id: row.owner_id, version },
      data: {
        dek_wrapped: new Uint8Array(row.dek_wrapped),
        kek_id: row.kek_id,
        key_version: row.key_version,
        updated_at: new Date(),
      },
    });
    return result.count === 1;
  }
}
