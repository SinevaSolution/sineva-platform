import type { SigningKeyEntity, SigningKeyPurpose } from '../entities/signing_key';

export interface SigningKeyRepository {
  findActiveKey(purpose?: SigningKeyPurpose): Promise<SigningKeyEntity | null>;
  findByKid(kid: string): Promise<SigningKeyEntity | null>;
  listValidPublicKeys(purpose?: SigningKeyPurpose): Promise<SigningKeyEntity[]>;
  save(key: SigningKeyEntity): Promise<void>;
  rotate(newKey: SigningKeyEntity, retireKid?: string): Promise<void>;
}
