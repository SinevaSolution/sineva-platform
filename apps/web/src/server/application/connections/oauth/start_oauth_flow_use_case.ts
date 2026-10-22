import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ConnectionEntity, OwnerScope } from '@/server/domain/connections/connection';
import {
  ConnectionRevokedError,
  NotReconnectableError,
  OwnerScopeNotAllowedError,
  ProviderUnavailableError,
} from '@/server/domain/connections/connection_errors';
import { canManageConnection } from '@/server/domain/connections/connection_policy';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import { OAUTH_FLOW_TTL_MS } from '@/server/domain/connections/oauth_flow';
import { ENTITLEMENT_KEYS, type EntitlementService } from '@/server/domain/entitlements/entitlements';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { OAuthFlowRepository } from '@/server/domain/repositories/oauth_flow_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { SecretWriter } from '@/server/domain/vault/vault';
import type { ConnectorRegistry } from '../connector_registry';
import { newNonce, newPkcePair, newState, sanitizeReturnTo, sha256Hex } from './oauth_support';

export interface StartOAuthFlowDeps {
  registry: ConnectorRegistry;
  drivers: ConnectorDriverResolver;
  flows: OAuthFlowRepository;
  connections: ConnectionRepository;
  secrets: SecretWriter;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  audit: AuditLogger;
  /** The exact redirect URI registered with every provider for this environment. */
  entitlements: EntitlementService;
  redirectUri: string;
  clientIdFor: (providerId: string) => string;
  now?: () => Date;
}

export interface StartOAuthFlowInput {
  context: RequestContext;
  provider_id: string;
  /** Required for a new connection; a reconnect defaults to the connection's own bundle. */
  scope_bundle?: string;
  owner_scope: OwnerScope;
  return_to?: string;
  /** Reconnect or widen this connection; it keeps its id and grants. */
  connection_id?: string;
}

export interface StartOAuthFlowResult {
  flow_id: string;
  authorization_url: string;
  expires_at: Date;
}

function invalid(field: string, detail: string): ValidationError {
  return new ValidationError('Request payload validation failed', [{ code: 'validation_failed', field, detail }]);
}

/**
 * Step one of connecting (FR-CONN-06): authorize the caller, validate the
 * request, record the flow and hand back the provider URL. Workspace and user
 * come from the request context only; the body can name neither.
 */
export class StartOAuthFlowUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: StartOAuthFlowDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: StartOAuthFlowInput): Promise<StartOAuthFlowResult> {
    const { context } = input;
    const workspaceId = context.workspace_id;
    const role = context.role;
    if (!workspaceId || !role) throw new ForbiddenError('A workspace membership is required');

    const manifest = this.deps.registry.provider(input.provider_id);
    if (!manifest) throw new NotFoundError('Provider', input.provider_id);
    const availability = this.deps.registry.availability(manifest.provider_id);
    if (!availability.available) throw new ProviderUnavailableError(manifest.provider_id, availability.reason!);
    if (manifest.auth_type !== 'oauth2_pkce' || !manifest.oauth) {
      throw invalid('provider_id', 'This tool connects with a pasted key, not a sign-in');
    }

    // A reconnect works on an existing connection and inherits its owner scope.
    let connection: ConnectionEntity | null = null;
    if (input.connection_id) {
      connection = await this.deps.connections.findVisible(workspaceId, input.connection_id, context.user_id);
      if (!connection) throw new NotFoundError('Connection', input.connection_id);
      if (connection.status === 'revoked') throw new ConnectionRevokedError(connection.id);
      if (connection.provider_id !== manifest.provider_id) {
        throw invalid('provider_id', 'The connection belongs to another tool');
      }
      if (connection.auth_type !== 'oauth2_pkce') throw new NotReconnectableError(connection.id);
      if (!hasPermission(role, 'connection.disconnect').allowed || !canManageConnection(role, context.user_id, connection)) {
        throw new ForbiddenError('You cannot reconnect this connection');
      }
    }

    const ownerScope: OwnerScope = connection?.owner_scope ?? input.owner_scope;
    if (!connection) {
      if (ownerScope === 'user' && !manifest.personal_capable) throw new OwnerScopeNotAllowedError(manifest.provider_id);
      const permission = ownerScope === 'workspace' ? 'connection.connect_workspace' : 'connection.connect_personal';
      if (!hasPermission(role, permission).allowed) throw new ForbiddenError(`Permission denied: ${permission}`);
    }

    // A new connection counts against the plan (FR-BILL-34); a reconnect does not
    // add one. In `open` mode this never blocks but the check is still logged.
    if (!connection) {
      const headcount = await this.deps.connections.countActive(workspaceId);
      await this.deps.entitlements.assert(workspaceId, ENTITLEMENT_KEYS.CONNECTIONS, headcount + 1);
    }

    const bundleKey = input.scope_bundle ?? connection?.scope_bundle ?? manifest.bundles[0]?.bundle_key;
    const bundle = bundleKey ? this.deps.registry.bundle(manifest.provider_id, bundleKey) : null;
    if (!bundle) throw invalid('scope_bundle', 'Unknown scope bundle');

    const workspace = await this.deps.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundError('Workspace', workspaceId);
    const returnTo =
      input.return_to === undefined
        ? `/w/${workspace.workspace_slug}/connections`
        : sanitizeReturnTo(input.return_to);
    if (!returnTo) throw invalid('return_to', 'Must be a path inside the app');

    const state = newState();
    const pkce = newPkcePair();
    const nonce = newNonce();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + OAUTH_FLOW_TTL_MS);

    const flow = await this.deps.flows.create({
      workspace_id: workspaceId,
      user_id: context.user_id,
      provider_id: manifest.provider_id,
      connection_id: connection?.id ?? null,
      owner_scope: ownerScope,
      scope_bundle: bundle.bundle_key,
      scopes: bundle.scope_keys,
      state_hash: sha256Hex(state),
      nonce,
      redirect_uri: this.deps.redirectUri,
      issuer: manifest.oauth.issuer,
      session_hash: sha256Hex(context.session_id),
      return_to: returnTo,
      expires_at: expiresAt,
    });

    // From here the flow exists but nobody has been sent anywhere. If any later
    // step fails the row and the verifier are removed, so a failed start leaves
    // nothing that a callback could consume.
    try {
      if (manifest.oauth.pkce) {
        await this.deps.secrets.put(
          { owner_type: 'oauth_flow', owner_id: flow.id, workspace_id: workspaceId, provider_id: manifest.provider_id },
          { code_verifier: pkce.verifier },
        );
      }
      await this.deps.audit.log({
        action: 'connection.oauth_started',
        context,
        workspace_id: workspaceId,
        target_resource_type: 'oauth_flow',
        target_resource_id: flow.id,
        metadata: {
          provider_id: manifest.provider_id,
          scope_bundle: bundle.bundle_key,
          owner_scope: ownerScope,
          reconnect: Boolean(connection),
          ...(connection ? { connection_id: connection.id } : {}),
        },
      });
      const { url } = this.deps.drivers.driverFor(manifest.provider_id).authorize({
        redirect_uri: this.deps.redirectUri,
        state,
        scopes: bundle.scope_keys,
        client_id: this.deps.clientIdFor(manifest.provider_id),
        code_challenge: manifest.oauth.pkce ? pkce.challenge : undefined,
        nonce,
      });
      return { flow_id: flow.id, authorization_url: url, expires_at: expiresAt };
    } catch (error) {
      await this.deps.flows.remove(flow.id);
      await this.deps.secrets.erase({ owner_type: 'oauth_flow', owner_id: flow.id });
      throw error;
    }
  }
}
