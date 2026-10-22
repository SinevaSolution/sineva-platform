import type {
  SecretOwnerType,
  VaultSecretRepository,
  VaultSecretRow,
} from '@/server/domain/vault/vault';

/** Unit-test stand-in for the vault table: rows are copied in and out so a test can tamper with them. */
export class InMemoryVaultRepository implements VaultSecretRepository {
  readonly rows = new Map<string, VaultSecretRow>();

  private key(type: SecretOwnerType, id: string): string {
    return `${type}:${id}`;
  }

  async find(owner_type: SecretOwnerType, owner_id: string): Promise<VaultSecretRow | null> {
    const row = this.rows.get(this.key(owner_type, owner_id));
    return row ? { ...row } : null;
  }

  async save(
    row: Omit<VaultSecretRow, 'version'>,
    expected_version?: number,
  ): Promise<{ saved: boolean; version: number }> {
    const key = this.key(row.owner_type, row.owner_id);
    const existing = this.rows.get(key);
    if (expected_version !== undefined && (existing?.version ?? 0) !== expected_version) {
      return { saved: false, version: existing?.version ?? 0 };
    }
    const version = (existing?.version ?? 0) + 1;
    this.rows.set(key, { ...row, version });
    return { saved: true, version };
  }

  async delete(owner_type: SecretOwnerType, owner_id: string): Promise<void> {
    this.rows.delete(this.key(owner_type, owner_id));
  }

  async listNotWrappedBy(kek_id: string, limit: number): Promise<VaultSecretRow[]> {
    return [...this.rows.values()].filter((row) => row.kek_id !== kek_id).slice(0, limit).map((row) => ({ ...row }));
  }

  async rewrap(
    row: Pick<VaultSecretRow, 'owner_type' | 'owner_id' | 'dek_wrapped' | 'kek_id' | 'key_version'>,
    version: number,
  ): Promise<boolean> {
    const existing = this.rows.get(this.key(row.owner_type, row.owner_id));
    if (!existing || existing.version !== version) return false;
    this.rows.set(this.key(row.owner_type, row.owner_id), {
      ...existing,
      dek_wrapped: row.dek_wrapped,
      kek_id: row.kek_id,
      key_version: row.key_version,
    });
    return true;
  }
}
