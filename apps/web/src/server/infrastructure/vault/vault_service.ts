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
import { openSecret, sealSecret } from './envelope_crypto';

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
}
