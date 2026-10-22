import {
  ConnectionUnusableError,
  USABLE_CONNECTION_STATUSES,
  type ConnectionEntity,
} from '@/server/domain/connections/connection';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { SecretPayload, SecretReader } from '@/server/domain/vault/vault';

export interface ResolvedCredentials {
  connection: ConnectionEntity;
  credentials: SecretPayload;
  secret_version: number;
}

/**
 * The one place that turns a connection into plaintext credentials (ADR-0036).
 * The refresh worker and, later, the Tool Gateway call it; no other code holds
 * a `SecretReader`. The status check comes first so a connection that needs
 * reconnecting fails typed without a vault round trip, and a missing secret is
 * the same failure: callers never receive an empty credential.
 */
export class CredentialResolver {
  constructor(
    private readonly deps: {
      connections: ConnectionRepository;
      secrets: SecretReader;
    },
  ) {}

  async forConnection(workspaceId: string, connectionId: string): Promise<ResolvedCredentials> {
    const connection = await this.deps.connections.findById(workspaceId, connectionId);
    if (!connection) throw new NotFoundError('Connection', connectionId);

    if (connection.status === 'revoked') {
      throw new ConnectionUnusableError('connection_revoked', connection.id);
    }
    if (connection.status === 'needs_reconnect') {
      throw new ConnectionUnusableError('connection_needs_reconnect', connection.id);
    }
    if (!USABLE_CONNECTION_STATUSES.includes(connection.status)) {
      throw new ConnectionUnusableError('connection_unavailable', connection.id);
    }

    const secret = await this.deps.secrets.get({
      owner_type: 'connection',
      owner_id: connection.id,
      workspace_id: connection.workspace_id,
      provider_id: connection.provider_id,
    });
    if (!secret) {
      throw new ConnectionUnusableError('connection_needs_reconnect', connection.id);
    }
    return { connection, credentials: secret.payload, secret_version: secret.version };
  }
}
