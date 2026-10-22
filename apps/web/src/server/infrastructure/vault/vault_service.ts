import 'server-only';
import { ConflictError } from '@/server/domain/errors/domain_error';
import type {
  KmsPort,
  SecretPayload,
  SecretReader,
  SecretRef,
  SecretWriter,
  VaultSecretRepository,
} from '@/server/domain/vault/vault';
import { openSecret, sealSecret, secretAad } from './envelope_crypto';

/**
 * The vault (ADR-0036): seals and opens secrets and stores the rows through a
 * repository that runs on the vault database role. Built only in the
 * container. Callers hold it through `SecretWriter` (anywhere that stores or
 * erases a credential) or `SecretReader` (the credential resolver only).
 */
export class VaultService implements SecretReader, SecretWriter {
  constructor(
    private readonly repository: VaultSecretRepository,
    private readonly kms: KmsPort,
  ) {}

  async put(
    ref: SecretRef,
    payload: SecretPayload,
    options?: { expected_version?: number },
  ): Promise<{ version: number }> {
    const row = await sealSecret(this.kms, ref, payload);
    const result = await this.repository.save(row, options?.expected_version);
    if (!result.saved) {
      throw new ConflictError('VaultSecret', ref.owner_id);
    }
    return { version: result.version };
  }

  async get(ref: SecretRef): Promise<{ payload: SecretPayload; version: number } | null> {
    const row = await this.repository.find(ref.owner_type, ref.owner_id);
    if (!row) return null;
    return { payload: await openSecret(this.kms, row, ref), version: row.version };
  }

  async erase(ref: Pick<SecretRef, 'owner_type' | 'owner_id'>): Promise<void> {
    await this.repository.delete(ref.owner_type, ref.owner_id);
  }

  /**
   * KEK rotation (ADR-0036 decision 8): rewraps the data key of up to `limit`
   * rows that the current key did not wrap. The ciphertext, nonce and row version
   * are untouched, so a secret read before and after is the same bytes, and the
   * old key can be retired once `more` is false and `failed` is 0. A row that
   * changed in between is skipped (a refresh wrote it) and found again by the next
   * run; a row wrapped by a key this process no longer holds is counted as failed
   * and stays visible in `more`, never silently dropped.
   */
  async rotateKeys(limit: number): Promise<{ rotated: number; skipped: number; failed: number; more: boolean }> {
    const current = this.kms.currentKekId();
    const rows = await this.repository.listNotWrappedBy(current, limit);
    let rotated = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const wrapped = await this.kms.rotate(row.dek_wrapped, row.kek_id, secretAad(row));
        const ok = await this.repository.rewrap(
          { owner_type: row.owner_type, owner_id: row.owner_id, dek_wrapped: wrapped.wrapped, kek_id: wrapped.kek_id, key_version: wrapped.key_version },
          row.version,
        );
        if (ok) rotated += 1;
        else skipped += 1;
      } catch {
        failed += 1;
      }
    }
    const remaining = await this.repository.listNotWrappedBy(current, 1);
    return { rotated, skipped, failed, more: remaining.length > 0 };
  }
}
