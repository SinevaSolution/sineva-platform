import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ConnectionEntity, OwnerScope } from '@/server/domain/connections/connection';
import {
  ConnectionRevokedError,
  ConnectionTestFailedError,
  OwnerScopeNotAllowedError,
  ProviderUnavailableError,
  ProviderUnreachableError,
} from '@/server/domain/connections/connection_errors';
import { canManageConnection } from '@/server/domain/connections/connection_policy';
import { ConnectorAuthError, ConnectorUnreachableError, type ProviderManifest } from '@/server/domain/connections/connector';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ENTITLEMENT_KEYS, type EntitlementService } from '@/server/domain/entitlements/entitlements';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { ConnectionGrantRepository } from '@/server/domain/repositories/connection_grant_repository';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { SecretRef, SecretWriter } from '@/server/domain/vault/vault';
import type { ConnectionView } from '@/shared/connection_view';
import type { ConnectorRegistry } from './connector_registry';
import { viewerOf, type ConnectionViewBuilder } from './connection_view_builder';

export interface SaveApiKeyDeps {
  registry: ConnectorRegistry;
  drivers: ConnectorDriverResolver;
  connections: ConnectionRepository;
  grants: ConnectionGrantRepository;
  secrets: SecretWriter;
  audit: AuditLogger;
  transactions: TransactionRunner;
  entitlements: EntitlementService;
  builder: ConnectionViewBuilder;
  now?: () => Date;
}

const MAX_FIELD_LENGTH = 512;

function invalid(field: string, detail: string): ValidationError {
  return new ValidationError('Request payload validation failed', [{ code: 'validation_failed', field, detail }]);
}

/** Checks the pasted fields against the provider's field list and returns them trimmed. Unknown fields are refused, not ignored. */
function validateFields(manifest: ProviderManifest, secret: Record<string, string>): Record<string, string> {
  const fields = manifest.api_key?.fields ?? [];
  const known = new Set(fields.map((field) => field.field_key));
  for (const key of Object.keys(secret)) {
    if (!known.has(key)) throw invalid(`secret.${key}`, 'Unknown field');
  }
  const clean: Record<string, string> = {};
  for (const field of fields) {
    const raw = secret[field.field_key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) throw invalid(`secret.${field.field_key}`, 'This field is required');
    if (value.length > MAX_FIELD_LENGTH) throw invalid(`secret.${field.field_key}`, 'This value is too long');
    if (field.kind === 'choice' && !(field.choices ?? []).includes(value)) {
      throw invalid(`secret.${field.field_key}`, 'Choose one of the listed values');
    }
    clean[field.field_key] = value;
  }
  return clean;
}

/**
 * Connects a provider that uses a pasted key (FR-CONN-29), or replaces the key of
 * one that is already connected (FR-CONN-30). The key is tested against the
 * provider before anything is stored; a failed test stores nothing and the
 * answer says why without quoting the key. The key travels in this call only:
 * it goes from the request into the vault and is never part of a response, a
 * log line or an audit row.
 */
export class SaveApiKeyConnectionUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: SaveApiKeyDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: {
    context: RequestContext;
    provider_id: string;
    owner_scope?: OwnerScope;
    connection_id?: string;
    secret: Record<string, string>;
  }): Promise<{ connection: ConnectionView; created: boolean }> {
    const viewer = viewerOf(input.context);
    const manifest = this.deps.registry.provider(input.provider_id);
    if (!manifest) throw new NotFoundError('Provider', input.provider_id);
    const availability = this.deps.registry.availability(manifest.provider_id);
    if (!availability.available) throw new ProviderUnavailableError(manifest.provider_id, availability.reason!);
    if (manifest.auth_type !== 'api_key') {
      throw invalid('provider_id', 'This tool connects with a sign-in, not a pasted key');
    }
    // No pasted-key provider is personal: a shared payment key belongs to the workspace.
    if ((input.owner_scope ?? 'workspace') === 'user') throw new OwnerScopeNotAllowedError(manifest.provider_id);

    let existing: ConnectionEntity | null = null;
    if (input.connection_id) {
      existing = await this.deps.connections.findVisible(viewer.workspace_id, input.connection_id, viewer.user_id);
      if (!existing) throw new NotFoundError('Connection', input.connection_id);
      if (existing.status === 'revoked') throw new ConnectionRevokedError(existing.id);
      if (existing.provider_id !== manifest.provider_id || existing.auth_type !== 'api_key') {
        throw invalid('provider_id', 'The connection belongs to another tool');
      }
      if (!hasPermission(viewer.role, 'connection.disconnect').allowed || !canManageConnection(viewer.role, viewer.user_id, existing)) {
        throw new ForbiddenError('You cannot replace the key of this connection');
      }
    } else {
      if (!hasPermission(viewer.role, 'connection.connect_workspace').allowed) {
        throw new ForbiddenError('Permission denied: connection.connect_workspace');
      }
      const headcount = await this.deps.connections.countActive(viewer.workspace_id);
      await this.deps.entitlements.assert(viewer.workspace_id, ENTITLEMENT_KEYS.CONNECTIONS, headcount + 1);
    }

    const credentials = validateFields(manifest, input.secret);
    const label = await this.test(manifest, credentials);
    const now = this.now();

    if (existing) {
      const target = existing;
      await this.deps.transactions.run(async () => {
        await this.deps.secrets.put(this.ref(target), credentials);
        await this.deps.connections.update(target.workspace_id, target.id, {
          status: 'connected',
          account_label: label,
          last_error_code: null,
          last_health_at: now,
          secret_rotated_at: now,
        });
        await this.deps.audit.log({
          action: 'connection.secret_rotated',
          context: input.context,
          workspace_id: target.workspace_id,
          target_resource_type: 'connection',
          target_resource_id: target.id,
          metadata: { provider_id: target.provider_id },
        });
      });
      const updated = (await this.deps.connections.findById(target.workspace_id, target.id))!;
      return { connection: await this.deps.builder.connectionView(updated, viewer), created: false };
    }

    const bundle = manifest.bundles[0];
    let createdId: string | null = null;
    try {
      const created = await this.deps.transactions.run(async () => {
        const connection = await this.deps.connections.create({
          workspace_id: viewer.workspace_id,
          provider_id: manifest.provider_id,
          owner_scope: 'workspace',
          owner_user_id: null,
          created_by_user_id: viewer.user_id,
          auth_type: 'api_key',
          status: 'connected',
          scope_bundle: bundle?.bundle_key ?? null,
          requested_scopes: bundle?.scope_keys ?? [],
          granted_scopes: bundle?.scope_keys ?? [],
          // A pasted key names no account, so two keys are two connections.
          external_account_id: null,
          account_label: label,
          access_expires_at: null,
          refresh_expires_at: null,
          secret_rotated_at: now,
        });
        createdId = connection.id;
        await this.deps.connections.update(viewer.workspace_id, connection.id, { last_health_at: now });
        await this.deps.grants.replaceAll(
          viewer.workspace_id,
          connection.id,
          this.deps.registry.specialistsFor(manifest.provider_id).map((agent_slug) => ({ agent_slug, access_level: 'read' as const })),
          viewer.user_id,
        );
        // Separate database and role: written inside the callback so a failure rolls the rest back.
        await this.deps.secrets.put(this.ref(connection), credentials);
        await this.deps.audit.log({
          action: 'connection.created',
          context: input.context,
          workspace_id: viewer.workspace_id,
          target_resource_type: 'connection',
          target_resource_id: connection.id,
          metadata: { provider_id: manifest.provider_id, owner_scope: 'workspace', auth_type: 'api_key' },
        });
        return connection;
      });
      const row = (await this.deps.connections.findById(viewer.workspace_id, created.id))!;
      return { connection: await this.deps.builder.connectionView(row, viewer), created: true };
    } catch (error) {
      // The secret may have been written before a later step failed; leave no ciphertext for a connection that does not exist.
      if (createdId) await this.deps.secrets.erase({ owner_type: 'connection', owner_id: createdId }).catch(() => undefined);
      throw error;
    }
  }

  private ref(connection: Pick<ConnectionEntity, 'id' | 'workspace_id' | 'provider_id'>): SecretRef {
    return { owner_type: 'connection', owner_id: connection.id, workspace_id: connection.workspace_id, provider_id: connection.provider_id };
  }

  /** The test call. Returns the label to show; every failure becomes a typed error that never quotes the key. */
  private async test(manifest: ProviderManifest, credentials: Record<string, string>): Promise<string | null> {
    try {
      const identity = await this.deps.drivers.driverFor(manifest.provider_id).whoami({ credentials });
      return identity.account_label;
    } catch (error) {
      if (error instanceof ConnectorAuthError) {
        if (error.code === 'access_denied') throw new ConnectionTestFailedError('insufficient_permissions');
        if (error.code === 'invalid_client') throw new ConnectionTestFailedError('invalid_credentials');
        // Anything else the provider said is not something to tell the person about a key.
        throw new ProviderUnreachableError();
      }
      if (error instanceof ConnectorUnreachableError) throw new ProviderUnreachableError();
      throw error;
    }
  }
}
