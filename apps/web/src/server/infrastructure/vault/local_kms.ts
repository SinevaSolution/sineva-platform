import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  VaultDecryptError,
  VaultUnavailableError,
  type KmsPort,
  type WrappedDek,
} from '@/server/domain/vault/vault';
import { isDevDefaultSecret } from '@/server/infrastructure/config/env';

export interface LocalKmsOptions {
  /** `<kek_id>:<base64 of 32 bytes>`: the key that wraps new data keys. */
  current: string;
  /** Same form: the key rows were wrapped with before the last rotation. */
  previous?: string;
  production: boolean;
}

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEK_ID = /^[A-Za-z0-9._-]{1,64}$/;

interface Kek {
  id: string;
  key: Buffer;
}

function parseKek(value: string, production: boolean): Kek {
  const separator = value.indexOf(':');
  const id = separator === -1 ? '' : value.slice(0, separator);
  const key = separator === -1 ? Buffer.alloc(0) : Buffer.from(value.slice(separator + 1), 'base64');
  // Messages name the rule, never the value: a mistyped KEK would otherwise be
  // copied into a log line.
  if (!KEK_ID.test(id)) {
    throw new VaultUnavailableError('The vault key must look like <kek_id>:<base64 of 32 bytes>');
  }
  if (key.length !== 32) {
    throw new VaultUnavailableError('The vault key must be exactly 32 bytes (base64 encoded)');
  }
  if (production) {
    // A development default is recognised by its id (the same marker words the
    // other secrets use), so the key bytes never need a plaintext copy in code.
    if (isDevDefaultSecret(id)) {
      throw new VaultUnavailableError('The vault key id is a development default and cannot be used in production');
    }
    if (key.every((byte) => byte === key[0])) {
      throw new VaultUnavailableError('The vault key has no entropy (one repeated byte) and cannot be used in production');
    }
  }
  return { id, key };
}

/**
 * Development and test KMS: the key-encryption key comes from the environment.
 * It does not keep the KEK outside the application process, so it is weaker
 * than a cloud KMS or transit engine; the production adapter is decided before
 * M5 (OQ-CONN-1, ADR-0036). The KEK wraps data keys with AES-256-GCM and the
 * secret's context as authenticated data, so a wrapped key is also bound to
 * its row.
 */
export class LocalKms implements KmsPort {
  private readonly current: Kek;
  private readonly byId = new Map<string, Kek>();

  constructor(options: LocalKmsOptions) {
    this.current = parseKek(options.current, options.production);
    this.byId.set(this.current.id, this.current);
    if (options.previous) {
      const previous = parseKek(options.previous, options.production);
      if (previous.id === this.current.id) {
        throw new VaultUnavailableError('The previous vault key must have a different id than the current one');
      }
      this.byId.set(previous.id, previous);
    }
  }

  async wrapDek(dek: Buffer, aad: Buffer): Promise<WrappedDek> {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.current.key, nonce);
    cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(dek), cipher.final()]);
    return {
      wrapped: Buffer.concat([nonce, body, cipher.getAuthTag()]),
      kek_id: this.current.id,
      key_version: 1,
    };
  }

  async unwrapDek(wrapped: Buffer, kek_id: string, aad: Buffer): Promise<Buffer> {
    const kek = this.byId.get(kek_id);
    if (!kek) {
      throw new VaultUnavailableError('No vault key is configured for the key id stored with this secret');
    }
    if (wrapped.length < NONCE_BYTES + TAG_BYTES + 1) throw new VaultDecryptError();
    try {
      const nonce = wrapped.subarray(0, NONCE_BYTES);
      const tag = wrapped.subarray(wrapped.length - TAG_BYTES);
      const body = wrapped.subarray(NONCE_BYTES, wrapped.length - TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', kek.key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    } catch {
      throw new VaultDecryptError();
    }
  }

  async rotate(wrapped: Buffer, kek_id: string, aad: Buffer): Promise<WrappedDek> {
    const dek = await this.unwrapDek(wrapped, kek_id, aad);
    try {
      return await this.wrapDek(dek, aad);
    } finally {
      dek.fill(0);
    }
  }
}

/**
 * Placeholder for the production KMS adapter. Throws until D-M2-2 picks the
 * provider, so a deployment that selects it fails loudly instead of quietly
 * falling back to the local key.
 */
export class CloudKmsStub implements KmsPort {
  private fail(): never {
    throw new VaultUnavailableError('The production key service is not configured yet');
  }
  async wrapDek(): Promise<WrappedDek> {
    return this.fail();
  }
  async unwrapDek(): Promise<Buffer> {
    return this.fail();
  }
  async rotate(): Promise<WrappedDek> {
    return this.fail();
  }
}
