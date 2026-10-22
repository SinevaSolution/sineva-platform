// Credential vault ports (ADR-0036). Plaintext secrets exist only inside the
// process that calls `SecretReader.get`, for the length of one call; nothing
// here logs, caches or returns them anywhere else.

import { DomainError } from '@/server/domain/errors/domain_error';

export type SecretOwnerType = 'connection' | 'oauth_flow' | 'model_credential';
export const SECRET_OWNER_TYPES: readonly SecretOwnerType[] = ['connection', 'oauth_flow', 'model_credential'];

/**
 * Identifies one secret and binds it to its context. The four fields are the
 * authenticated data of the encryption (ADR-0036), so a row copied to another
 * workspace, owner or provider fails to decrypt.
 */
export interface SecretRef {
  owner_type: SecretOwnerType;
  owner_id: string;
  workspace_id: string;
  provider_id: string;
}

/** A flat JSON object: tokens, keys, expiry numbers. Never nested user content. */
export type SecretPayload = Record<string, string | number | boolean | null>;

export interface SecretWriter {
  /**
   * Stores or replaces the secret. With `expected_version` the write is a
   * compare-and-swap: a different current version rejects with a conflict, so
   * two refreshes cannot overwrite each other. Returns the new version.
   */
  put(ref: SecretRef, payload: SecretPayload, options?: { expected_version?: number }): Promise<{ version: number }>;
  /** Deletes the ciphertext and the wrapped data key. Idempotent. */
  erase(ref: Pick<SecretRef, 'owner_type' | 'owner_id'>): Promise<void>;
}

/**
 * The only read path to plaintext. Imported by the credential resolver (and
 * through it the refresh worker and, later, the Tool Gateway), nowhere else;
 * `vault_access.test.ts` enforces that.
 */
export interface SecretReader {
  get(ref: SecretRef): Promise<{ payload: SecretPayload; version: number } | null>;
}

export interface WrappedDek {
  wrapped: Buffer;
  kek_id: string;
  /** Version of the KEK that wrapped it. */
  key_version: number;
}

/** Key-encryption key operations. The KEK never leaves the adapter. */
export interface KmsPort {
  /** `aad` binds the wrapped key to the secret's context. */
  wrapDek(dek: Buffer, aad: Buffer): Promise<WrappedDek>;
  unwrapDek(wrapped: Buffer, kek_id: string, aad: Buffer): Promise<Buffer>;
  /** Rewraps a wrapped DEK under the current KEK without touching the secret's ciphertext. */
  rotate(wrapped: Buffer, kek_id: string, aad: Buffer): Promise<WrappedDek>;
}

export interface VaultSecretRow {
  owner_type: SecretOwnerType;
  owner_id: string;
  workspace_id: string;
  provider_id: string;
  ciphertext: Buffer;
  nonce: Buffer;
  dek_wrapped: Buffer;
  kek_id: string;
  key_version: number;
  version: number;
}

/** Row storage for the vault. The Postgres adapter runs on the vault database role. */
export interface VaultSecretRepository {
  find(owner_type: SecretOwnerType, owner_id: string): Promise<VaultSecretRow | null>;
  /** Insert or replace. With `expected_version` only a row at that version is replaced; false means it was not. */
  save(row: Omit<VaultSecretRow, 'version'>, expected_version?: number): Promise<{ saved: boolean; version: number }>;
  delete(owner_type: SecretOwnerType, owner_id: string): Promise<void>;
  /** Rows written under a KEK other than `kek_id`, for the rotation runbook. */
  listNotWrappedBy(kek_id: string, limit: number): Promise<VaultSecretRow[]>;
  /** Replaces only the wrapped key columns of a row still at `version`. */
  rewrap(row: Pick<VaultSecretRow, 'owner_type' | 'owner_id' | 'dek_wrapped' | 'kek_id' | 'key_version'>, version: number): Promise<boolean>;
}

/** The vault or its key service is not configured or reachable. Typed 503, never a fallback. */
export class VaultUnavailableError extends DomainError {
  constructor(reason: string) {
    super({
      message: 'The credential vault is not available',
      code: 'vault_unavailable',
      status: 503,
      details: [{ code: 'vault_unavailable', field: null, detail: reason }],
    });
    this.name = 'VaultUnavailableError';
  }
}

/** A secret failed authentication: wrong context, tampered or corrupted row. */
export class VaultDecryptError extends DomainError {
  constructor() {
    super({
      message: 'The stored credential could not be read',
      code: 'vault_decrypt_failed',
      status: 500,
    });
    this.name = 'VaultDecryptError';
  }
}
