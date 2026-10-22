import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ActionDefinition, ProviderManifest } from '@/server/domain/connections/connector';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConnectionEntity } from '@/server/domain/connections/connection';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { ConnectionGrantRepository } from '@/server/domain/repositories/connection_grant_repository';
import type { SecretPayload } from '@/server/domain/vault/vault';
import type { GatewayContext, ToolContextVerifier } from './gateway_context';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { ToolExecutor } from './tool_executor';

export interface GatewayRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
  run_id: string;
  call_id: string;
  idempotency_key?: string;
  mode: 'live' | 'simulate';
}
export interface GatewayResponse {
  status: 'ok' | 'approval_required' | 'denied' | 'error';
  result?: Record<string, unknown>;
  approval_id?: string;
  error_code: string | null;
}
export interface GatewayRegistry {
  action(id: string): ActionDefinition | null;
  provider(id: string): ProviderManifest | null;
  isEgressAllowed(providerId: string, url: string): boolean;
}
export interface ApprovedGatewayCall {
  id: string;
  claims: GatewayContext;
  request: GatewayRequest;
  connection_id: string;
  external_account_id: string | null;
  payload_hash: string;
}
export interface GatewayState {
  /** Current membership, account status, specialist access and run ownership, never just JWT role. */
  authorize(claims: GatewayContext): Promise<RequestContext>;
  isBlocked(
    workspaceId: string,
    providerId: string,
    agentSlug: string,
    write: boolean,
  ): Promise<boolean>;
  /** Reserves permanently for writes: a crashed/ambiguous attempt is never retried automatically. */
  claim(
    context: GatewayContext,
    request: GatewayRequest,
    payloadHash: string,
    connectionId?: string,
  ): Promise<
    | { status: 'claimed'; id: string }
    | { status: 'replay'; response: GatewayResponse }
    | { status: 'busy' }
    | { status: 'conflict' }
  >;
  finish(id: string, response: GatewayResponse): Promise<void>;
  releaseUnexecuted(id: string): Promise<void>;
  loadApprovalCall(
    workspaceId: string,
    approvalId: string,
    deciderId: string,
  ): Promise<ApprovedGatewayCall>;
  claimApproved(
    id: string,
    approvalId: string,
  ): Promise<
    | { status: 'claimed'; id: string }
    | { status: 'replay'; response: GatewayResponse }
    | { status: 'busy' }
  >;
  /** Atomic shared rate limit; failure must refuse the call. */
  takeRateSlot(workspaceId: string, connectionId: string, providerId: string): Promise<boolean>;
}
export interface GatewayApprovalCreator {
  create(input: {
    claims: GatewayContext;
    request: GatewayRequest;
    connection_id: string;
    external_account_id: string | null;
    account_label: string | null;
    action: ActionDefinition;
    payload_hash: string;
    gateway_call_id: string;
    context: RequestContext;
  }): Promise<string>;
}
export interface GatewayDeps {
  verifier: ToolContextVerifier;
  state: GatewayState;
  registry: GatewayRegistry;
  connections: ConnectionRepository;
  grants: ConnectionGrantRepository;
  credentials: {
    forConnection(
      workspaceId: string,
      connectionId: string,
    ): Promise<{ credentials: SecretPayload; connection: ConnectionEntity }>;
  };
  executor: ToolExecutor;
  approvals: GatewayApprovalCreator;
  audit: AuditLogger;
  transactions: TransactionRunner;
  /** Credential-pattern masking plus exact matches of the just-resolved secrets. */
  redact(value: Record<string, unknown>, credentials: SecretPayload): Record<string, unknown>;
}
