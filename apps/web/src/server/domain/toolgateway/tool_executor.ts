import { DomainError } from '@/server/domain/errors/domain_error';
import type { SecretPayload } from '@/server/domain/vault/vault';

export class ToolGatewayError extends DomainError {
  constructor(
    code: string,
    status = 403,
    readonly safe_to_retry = false,
  ) {
    super({ code, status, message: 'The requested tool action could not be completed' });
  }
}

export class ToolResultTruncatedError extends Error {
  constructor(readonly limit_bytes: number) {
    super('response_truncated');
  }
}

export interface ToolExecutor {
  supports(action: string): boolean;
  /** Fixed provider destination, checked before credentials are resolved. */
  endpoint(action: string): string;
  execute(
    action: string,
    args: Record<string, unknown>,
    credentials: SecretPayload,
    callId: string,
    source?: { external_account_id: string | null; account_label: string | null },
  ): Promise<Record<string, unknown>>;
}
