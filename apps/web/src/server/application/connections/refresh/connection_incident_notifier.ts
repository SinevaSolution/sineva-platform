import type { ConnectionEntity } from '@/server/domain/connections/connection';
import type { ConnectionLog } from '@/server/domain/connections/connection_errors';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';
import type { EmailSender } from '@/server/domain/email/email_sender';
import type { InboxItemCreator } from '@/server/domain/inbox/inbox_item_creator';
import type { MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import type { ConnectorRegistry } from '../connector_registry';

export interface IncidentNotifierDeps {
  inbox: InboxItemCreator;
  accounts: Pick<MemberAccountLookup, 'findById'>;
  email: EmailSender;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  registry: Pick<ConnectorRegistry, 'provider'>;
  /** `NEXT_PUBLIC_APP_URL`, for the link in the email. */
  appUrl: string;
  log: ConnectionLog;
}

/**
 * Tells the right person that a connection stopped working (FR-CONN-22): a
 * system item in the Inbox and an email. Both are best effort and never throw:
 * the status change that triggered this is already committed and must not be
 * undone because a mail server is down. A failed notification is logged by
 * step so it does not vanish.
 *
 * The recipient is the person who owns a personal connection, or the person who
 * set up a workspace connection.
 */
export class ConnectionIncidentNotifier {
  constructor(private readonly deps: IncidentNotifierDeps) {}

  async needsReconnect(connection: ConnectionEntity): Promise<void> {
    const providerName = this.deps.registry.provider(connection.provider_id)?.display_name ?? connection.provider_id;
    const recipientId = connection.owner_user_id ?? connection.created_by_user_id;
    // One item per incident: the key changes when the connection is reconnected
    // and later breaks again, because the last refresh time moves.
    const incident = (connection.last_refreshed_at ?? connection.created_at).getTime();
    const dedupeKey = `connection_needs_reconnect:${connection.id}:${incident}`;

    try {
      await this.deps.inbox.create(
        {
          kind: 'result',
          workspace_id: connection.workspace_id,
          recipient_user_id: recipientId,
          // The orchestrator speaks for the system; there is no specialist behind this notice.
          agent_slug: 'sino',
          title: providerName,
          source: { type: 'system', id: connection.id },
          dedupe_key: dedupeKey,
          summary_key: 'inbox.sentence.connection_needs_reconnect',
          summary_params: { provider: providerName },
        },
        {
          ...createAnonymousRequestContext(`connection_${connection.id}`),
          user_id: 'system:connections',
          workspace_id: connection.workspace_id,
          actor: { type: 'system', id: 'connections' },
        },
      );
    } catch (error) {
      this.fail(connection, error);
    }

    if (!recipientId) return;
    try {
      const [account, workspace] = await Promise.all([
        this.deps.accounts.findById(recipientId),
        this.deps.workspaces.findById(connection.workspace_id),
      ]);
      if (!account || !workspace) return;
      await this.deps.email.send({
        to: account.email,
        template: 'connection_needs_reconnect',
        locale: account.locale === 'id' ? 'id' : 'en',
        params: {
          recipient_name: account.preferred_name ?? account.full_name,
          provider_name: providerName,
          url: `${this.deps.appUrl.replace(/\/+$/, '')}/w/${workspace.workspace_slug}/connections`,
        },
        idempotency_key: dedupeKey,
      });
    } catch (error) {
      this.fail(connection, error);
    }
  }

  /** The 90 day reminder for a pasted key (FR-CONN-30): an Inbox item, once per key. No email: nothing is broken. */
  async rotationDue(connection: ConnectionEntity): Promise<void> {
    const providerName = this.deps.registry.provider(connection.provider_id)?.display_name ?? connection.provider_id;
    const keyAge = (connection.secret_rotated_at ?? connection.created_at).getTime();
    try {
      await this.deps.inbox.create(
        {
          kind: 'result',
          workspace_id: connection.workspace_id,
          recipient_user_id: connection.owner_user_id ?? connection.created_by_user_id,
          agent_slug: 'sino',
          title: providerName,
          source: { type: 'system', id: connection.id },
          // One reminder per key: replacing the key moves the time, so the next key gets its own.
          dedupe_key: `connection_rotation_due:${connection.id}:${keyAge}`,
          summary_key: 'inbox.sentence.connection_rotation_due',
          summary_params: { provider: providerName },
        },
        {
          ...createAnonymousRequestContext(`connection_${connection.id}`),
          user_id: 'system:connections',
          workspace_id: connection.workspace_id,
          actor: { type: 'system', id: 'connections' },
        },
      );
    } catch (error) {
      this.fail(connection, error);
    }
  }

  private fail(connection: ConnectionEntity, error: unknown): void {
    this.deps.log.failed('inbox_notify_failed', {
      workspace_id: connection.workspace_id,
      connection_id: connection.id,
      provider_id: connection.provider_id,
      code: error instanceof Error ? error.name : 'unknown',
    });
  }
}
