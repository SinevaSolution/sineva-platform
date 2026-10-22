import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';
import type { SigningKeyEntity } from '@/server/domain/entities/signing_key';
import type { SigningKeyRepository } from '@/server/domain/repositories/signing_key_repository';
import { noTransaction, type TransactionRunner } from '@/server/domain/transactions/transaction_runner';

export interface RotateSigningKeyInput {
  new_key: SigningKeyEntity;
  retire_kid?: string;
  /** The operator performing the rotation; defaults to the system actor. */
  context?: RequestContext;
}

// Public keys only: the private key never touches the database, so there is
// nothing sensitive to leave out of the audit row beyond the key body itself,
// which is also omitted (the `kid` identifies it).
export class RotateSigningKeyUseCase {
  constructor(
    private readonly keys: SigningKeyRepository,
    private readonly audit: AuditLogger,
    private readonly transactions: TransactionRunner = noTransaction,
  ) {}

  async execute(input: RotateSigningKeyInput): Promise<void> {
    const { new_key, retire_kid } = input;
    const context = input.context ?? createAnonymousRequestContext('signing-key-rotation');

    await this.transactions.run(async () => {
      await this.keys.rotate(new_key, retire_kid);
      await this.audit.log({
        action: 'signing_key.rotated',
        context,
        target_resource_type: 'signing_key',
        target_resource_id: new_key.kid,
        metadata: {
          purpose: new_key.purpose,
          alg: new_key.alg,
          valid_until: new_key.valid_until,
          ...(retire_kid ? { retired_kid: retire_kid } : {}),
        },
      });
    });
  }
}
