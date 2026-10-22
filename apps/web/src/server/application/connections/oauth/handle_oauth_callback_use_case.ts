import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { ConnectionEntity, ConnectionStatus } from '@/server/domain/connections/connection';
import type { ConnectionLog } from '@/server/domain/connections/connection_errors';
import { canManageConnection } from '@/server/domain/connections/connection_policy';
import {
  ConnectorAuthError,
  ConnectorUnreachableError,
  type ConnectorDriver,
  type TokenSet,
} from '@/server/domain/connections/connector';
import type { ConnectorDriverResolver } from '@/server/domain/connections/driver_resolver';
import type { OAuthFlowEntity, OAuthResultCode } from '@/server/domain/connections/oauth_flow';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import { ConflictError, NotFoundError } from '@/server/domain/errors/domain_error';
import { hasPermission } from '@/server/domain/permissions/registry';
import type { ConnectionGrantRepository } from '@/server/domain/repositories/connection_grant_repository';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';
import type { OAuthFlowRepository } from '@/server/domain/repositories/oauth_flow_repository';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { SecretPayload, SecretRef, SecretWriter } from '@/server/domain/vault/vault';
import type { ConnectorRegistry } from '../connector_registry';
import type { CredentialResolver } from '../credential_resolver';
import { resultRedirect, sha256Hex } from './oauth_support';

export interface HandleOAuthCallbackDeps {
  registry: ConnectorRegistry;
  drivers: ConnectorDriverResolver;
  flows: OAuthFlowRepository;
  connections: ConnectionRepository;
  grants: ConnectionGrantRepository;
  secrets: SecretWriter;
  resolver: CredentialResolver;
  members: Pick<WorkspaceMemberRepository, 'findMembership'>;
  audit: AuditLogger;
  transactions: TransactionRunner;
  log: ConnectionLog;
  now?: () => Date;
}

export interface OAuthCallbackInput {
  query: { code?: string; state?: string; error?: string; iss?: string };
  /** The browser session on the callback request, or nulls when there is none. */
  session: { user_id: string | null; session_id: string | null };
  request_id: string;
}

export interface OAuthCallbackResult {
  result: OAuthResultCode;
  redirect_to: string;
  connection_id?: string;
}

/**
 * Step two of connecting (FR-CONN-10 to FR-CONN-14, FR-CONN-24). The callback is
 * a cross-site GET, so it trusts nothing it is handed except the one-time
 * `state`, and it validates in the order the PRD fixes: consume the flow
 * atomically, then provider error, expiry, session binding, the role, `iss`,
 * and only then redeem the code. It never answers with JSON or provider text:
 * every outcome is a redirect target with a result code.
 */
export class HandleOAuthCallbackUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: HandleOAuthCallbackDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
    const { state } = input.query;
    if (!state) return this.to('/', 'expired');

    // One atomic conditional update. A replay, a guessed state and an expired
    // row that was already consumed all look the same: nothing found.
    const flow = await this.deps.flows.consume(sha256Hex(state), this.now());
    if (!flow) return this.to('/', 'expired');

    try {
      return await this.complete(flow, input);
    } finally {
      await this.eraseVerifier(flow);
    }
  }

  private to(
    path: string,
    result: OAuthResultCode,
    extra: { provider_id?: string; connection_id?: string } = {},
  ): OAuthCallbackResult {
    return {
      result,
      redirect_to: resultRedirect(path, result, extra),
      ...(extra.connection_id ? { connection_id: extra.connection_id } : {}),
    };
  }

  private async eraseVerifier(flow: OAuthFlowEntity): Promise<void> {
    try {
      await this.deps.secrets.erase({ owner_type: 'oauth_flow', owner_id: flow.id });
    } catch (error) {
      // The flow is consumed, so a leftover verifier cannot be used; it is
      // still reported so a vault that cannot delete does not go unnoticed.
      this.deps.log.failed('verifier_erase', {
        workspace_id: flow.workspace_id,
        provider_id: flow.provider_id,
        code: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private async complete(flow: OAuthFlowEntity, input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
    const now = this.now();
    const { code, error, iss } = input.query;
    const back = (result: OAuthResultCode, extra?: { provider_id?: string; connection_id?: string }) =>
      this.to(flow.return_to, result, extra);

    // 1. The provider reported an error (a person who declines is not a failure).
    if (error) return back(error === 'access_denied' ? 'denied' : 'error');

    // 2. Expiry.
    if (now.getTime() >= flow.expires_at.getTime()) return back('expired');

    // 3. The browser on this request is the one that started the flow. A
    // mismatch goes to `/`, not to the flow's page, so nothing about the
    // workspace is revealed to whoever followed the link.
    const { session } = input;
    if (
      !session.user_id ||
      !session.session_id ||
      session.user_id !== flow.user_id ||
      sha256Hex(session.session_id) !== flow.session_hash
    ) {
      return this.to('/', 'error');
    }

    // 4. The person still belongs here and still may do this.
    const membership = await this.deps.members.findMembership(flow.workspace_id, flow.user_id);
    const role = membership?.role as UserRole | undefined;
    const needed = flow.connection_id
      ? 'connection.disconnect'
      : flow.owner_scope === 'workspace'
        ? 'connection.connect_workspace'
        : 'connection.connect_personal';
    if (!role || !hasPermission(role, needed).allowed) return this.to('/', 'error');

    // 5. Mix-up defense (RFC 9207): when the provider says who answered, it must be who we asked.
    if (iss !== undefined && iss !== flow.issuer) return back('error');
    if (!code) return back('error');

    const manifest = this.deps.registry.provider(flow.provider_id);
    if (!manifest?.oauth) return back('error');

    // 6. Redeem the code, server side, with the verifier.
    let driver: ConnectorDriver;
    let tokens: TokenSet;
    try {
      driver = this.deps.drivers.driverFor(flow.provider_id);
      const verifier = manifest.oauth.pkce ? (await this.deps.resolver.forOAuthFlow(flow)).verifier : undefined;
      tokens = await driver.exchange({ code, redirect_uri: flow.redirect_uri, code_verifier: verifier });
    } catch (failure) {
      if (this.isExpectedProviderFailure(failure)) return back('error');
      throw failure;
    }

    // 7. Who is this account?
    let identity;
    try {
      identity = await driver.whoami({ access_token: tokens.access_token, token_account: tokens.account });
    } catch (failure) {
      await this.revokeQuietly(driver, tokens, flow);
      if (this.isExpectedProviderFailure(failure)) return back('error');
      throw failure;
    }

    // 8. Scopes: only what the chosen bundle asked for counts, whatever the provider added.
    // A provider that omits `scope` granted what was asked (RFC 6749 section 5.1).
    const reported = tokens.scopes ?? flow.scopes;
    const granted = flow.scopes.filter((scope) => reported.includes(scope));
    const missing = flow.scopes.filter((scope) => !granted.includes(scope));
    const extraCount = reported.filter((scope) => !flow.scopes.includes(scope)).length;
    const status: ConnectionStatus = missing.length > 0 ? 'partial' : 'connected';

    // 9. Reconnect target, wrong account and duplicate checks.
    const ownerUserId = flow.owner_scope === 'user' ? flow.user_id : null;
    let existing: ConnectionEntity | null = null;
    if (flow.connection_id) {
      existing = await this.deps.connections.findById(flow.workspace_id, flow.connection_id);
      if (!existing || existing.status === 'revoked' || existing.provider_id !== flow.provider_id) {
        await this.revokeQuietly(driver, tokens, flow);
        return back('error');
      }
      if (!canManageConnection(role, flow.user_id, existing)) {
        await this.revokeQuietly(driver, tokens, flow);
        return this.to('/', 'error');
      }
      if (
        existing.external_account_id &&
        identity.external_account_id &&
        existing.external_account_id !== identity.external_account_id
      ) {
        await this.revokeQuietly(driver, tokens, flow);
        return back('different_account', { provider_id: flow.provider_id, connection_id: existing.id });
      }
    }
    if (identity.external_account_id) {
      const duplicate = await this.deps.connections.findActiveByAccount(
        flow.workspace_id,
        flow.provider_id,
        ownerUserId,
        identity.external_account_id,
      );
      if (duplicate && duplicate.id !== existing?.id) {
        await this.revokeQuietly(driver, tokens, flow);
        return back('duplicate_account', { provider_id: flow.provider_id, connection_id: duplicate.id });
      }
    }

    const context: RequestContext = {
      user_id: flow.user_id,
      workspace_id: flow.workspace_id,
      role,
      session_id: session.session_id,
      request_id: input.request_id,
      actor: { type: 'user', id: flow.user_id },
    };
    const accessExpiresAt = tokens.expires_in === null ? null : new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshToken = tokens.refresh_token ?? (existing ? await this.deps.resolver.previousRefreshToken(existing) : null);
    const payload: SecretPayload = {
      access_token: tokens.access_token,
      token_type: tokens.token_type,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
    };
    const auditMetadata = {
      provider_id: flow.provider_id,
      owner_scope: flow.owner_scope,
      scope_bundle: flow.scope_bundle,
      granted_scope_count: granted.length,
      missing_scope_count: missing.length,
      extra_scope_count: extraCount,
    };

    if (existing) {
      const target = existing;
      await this.deps.transactions.run(async () => {
        await this.deps.connections.update(flow.workspace_id, target.id, {
          status,
          scope_bundle: flow.scope_bundle,
          requested_scopes: flow.scopes,
          granted_scopes: granted,
          external_account_id: identity.external_account_id ?? target.external_account_id,
          account_label: identity.account_label ?? target.account_label,
          access_expires_at: accessExpiresAt,
          refresh_expires_at: null,
          last_refreshed_at: now,
          last_error_code: null,
        });
        await this.deps.secrets.put(this.secretRef(flow, target.id), payload);
        await this.deps.audit.log({
          action: 'connection.reconnected',
          context,
          workspace_id: flow.workspace_id,
          target_resource_type: 'connection',
          target_resource_id: target.id,
          metadata: auditMetadata,
        });
        if (missing.length > 0) await this.auditDowngrade(context, flow, target.id, missing.length);
      });
      return back(status === 'partial' ? 'partial' : 'reconnected', {
        provider_id: flow.provider_id,
        connection_id: target.id,
      });
    }

    let createdId: string | null = null;
    try {
      const created = await this.deps.transactions.run(async () => {
        const connection = await this.deps.connections.create({
          workspace_id: flow.workspace_id,
          provider_id: flow.provider_id,
          owner_scope: flow.owner_scope,
          owner_user_id: ownerUserId,
          created_by_user_id: flow.user_id,
          auth_type: 'oauth2_pkce',
          status,
          scope_bundle: flow.scope_bundle,
          requested_scopes: flow.scopes,
          granted_scopes: granted,
          external_account_id: identity.external_account_id,
          account_label: identity.account_label,
          access_expires_at: accessExpiresAt,
          refresh_expires_at: null,
          last_refreshed_at: now,
        });
        createdId = connection.id;
        // Read for the specialists whose skills declare the provider; write is never a default (FR-CONN-04).
        await this.deps.grants.replaceAll(
          flow.workspace_id,
          connection.id,
          this.deps.registry.specialistsFor(flow.provider_id).map((agent_slug) => ({ agent_slug, access_level: 'read' as const })),
          flow.user_id,
        );
        // The vault is a separate database and role, so this write is outside the
        // transaction. It sits inside the callback so that if it throws, the row,
        // the grants and the audit event roll back with it.
        await this.deps.secrets.put(this.secretRef(flow, connection.id), payload);
        await this.deps.audit.log({
          action: 'connection.created',
          context,
          workspace_id: flow.workspace_id,
          target_resource_type: 'connection',
          target_resource_id: connection.id,
          metadata: auditMetadata,
        });
        if (missing.length > 0) await this.auditDowngrade(context, flow, connection.id, missing.length);
        return connection;
      });
      return back(status === 'partial' ? 'partial' : 'connected', {
        provider_id: flow.provider_id,
        connection_id: created.id,
      });
    } catch (failure) {
      // The secret may have been written before a later step failed; remove it so no
      // ciphertext is left for a connection that does not exist.
      if (createdId) await this.eraseConnectionSecret(flow, createdId);
      if (failure instanceof ConflictError) {
        // A concurrent callback for the same account won the unique index.
        await this.revokeQuietly(driver, tokens, flow);
        const winner = identity.external_account_id
          ? await this.deps.connections.findActiveByAccount(flow.workspace_id, flow.provider_id, ownerUserId, identity.external_account_id)
          : null;
        return back('duplicate_account', { provider_id: flow.provider_id, ...(winner ? { connection_id: winner.id } : {}) });
      }
      throw failure;
    }
  }

  private secretRef(flow: OAuthFlowEntity, connectionId: string): SecretRef {
    return { owner_type: 'connection', owner_id: connectionId, workspace_id: flow.workspace_id, provider_id: flow.provider_id };
  }

  private async eraseConnectionSecret(flow: OAuthFlowEntity, connectionId: string): Promise<void> {
    try {
      await this.deps.secrets.erase({ owner_type: 'connection', owner_id: connectionId });
    } catch (error) {
      this.deps.log.failed('verifier_erase', {
        workspace_id: flow.workspace_id,
        connection_id: connectionId,
        provider_id: flow.provider_id,
        code: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private async auditDowngrade(context: RequestContext, flow: OAuthFlowEntity, connectionId: string, missing: number): Promise<void> {
    await this.deps.audit.log({
      action: 'connection.scope_downgraded',
      context,
      workspace_id: flow.workspace_id,
      target_resource_type: 'connection',
      target_resource_id: connectionId,
      metadata: { provider_id: flow.provider_id, scope_bundle: flow.scope_bundle, missing_scope_count: missing },
    });
  }

  /** Tokens we decided not to keep must not stay valid at the provider. Best effort, reported when it fails. */
  private async revokeQuietly(driver: ConnectorDriver, tokens: TokenSet, flow: OAuthFlowEntity): Promise<void> {
    const token = tokens.refresh_token ?? tokens.access_token;
    const type = tokens.refresh_token ? 'refresh_token' : 'access_token';
    try {
      const revoked = await driver.revoke({ token, token_type: type });
      if (!revoked) {
        this.deps.log.failed('provider_revoke', { workspace_id: flow.workspace_id, provider_id: flow.provider_id, code: 'not_confirmed' });
      }
    } catch (error) {
      this.deps.log.failed('provider_revoke', {
        workspace_id: flow.workspace_id,
        provider_id: flow.provider_id,
        code: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private isExpectedProviderFailure(error: unknown): boolean {
    return (
      error instanceof ConnectorAuthError ||
      error instanceof ConnectorUnreachableError ||
      error instanceof NotFoundError
    );
  }
}
