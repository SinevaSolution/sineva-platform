import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  VaultDecryptError,
  type KmsPort,
  type SecretPayload,
  type SecretRef,
  type VaultSecretRow,
} from '@/server/domain/vault/vault';

const TAG_BYTES = 16;
const NONCE_BYTES = 12;

/**
 * Authenticated data of a secret: owner type, owner id, workspace and provider
 * as a JSON array. JSON (not a delimiter join) so no value can shift a field
 * boundary, and a version tag so the layout can change under a new tag.
 * It authenticates both the payload and the wrapped data key.
 */
export function secretAad(ref: SecretRef): Buffer {
  return Buffer.from(
    JSON.stringify(['sineva.vault.v1', ref.owner_type, ref.owner_id, ref.workspace_id, ref.provider_id]),
    'utf8',
  );
}

/**
 * Encrypts `payload` under a fresh 256-bit data key and a fresh random 96-bit
 * nonce, then wraps the data key through the KMS. A new data key on every
 * write means a nonce can never repeat under one key, so there is no counter
 * or nonce bookkeeping to get wrong.
 */
export async function sealSecret(
  kms: KmsPort,
  ref: SecretRef,
  payload: SecretPayload,
): Promise<Omit<VaultSecretRow, 'version'>> {
  const aad = secretAad(ref);
  const dek = randomBytes(32);
  try {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', dek, nonce);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]);
    const wrapped = await kms.wrapDek(dek, aad);
    return {
      owner_type: ref.owner_type,
      owner_id: ref.owner_id,
      workspace_id: ref.workspace_id,
      provider_id: ref.provider_id,
      ciphertext,
      nonce,
      dek_wrapped: wrapped.wrapped,
      kek_id: wrapped.kek_id,
      key_version: wrapped.key_version,
    };
  } finally {
    dek.fill(0);
  }
}

/**
 * Decrypts a row for the context the caller presents. Any authentication
 * failure (wrong context, tampered bytes) is one `VaultDecryptError` with no
 * detail: telling which part failed would help an attacker probing a copied
 * row and would risk quoting key material.
 */
export async function openSecret(kms: KmsPort, row: VaultSecretRow, ref: SecretRef): Promise<SecretPayload> {
  const aad = secretAad(ref);
  const dek = await kms.unwrapDek(row.dek_wrapped, row.kek_id, aad);
  try {
    if (row.ciphertext.length < TAG_BYTES || row.nonce.length !== NONCE_BYTES) {
      throw new VaultDecryptError();
    }
    const body = row.ciphertext.subarray(0, row.ciphertext.length - TAG_BYTES);
    const tag = row.ciphertext.subarray(row.ciphertext.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', dek, row.nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    try {
      return JSON.parse(plain.toString('utf8')) as SecretPayload;
    } finally {
      plain.fill(0);
    }
  } catch (error) {
    if (error instanceof VaultDecryptError) throw error;
    throw new VaultDecryptError();
  } finally {
    dek.fill(0);
  }
}
