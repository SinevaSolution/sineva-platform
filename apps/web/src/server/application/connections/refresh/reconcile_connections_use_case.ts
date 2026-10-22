import type { ConnectionLog } from '@/server/domain/connections/connection_errors';
import type { JobQueue } from '@/server/domain/jobs/job_queue';
import type { ConnectionRepository } from '@/server/domain/repositories/connection_repository';

export interface ReconcileDeps {
  connections: ConnectionRepository;
  queue: JobQueue;
  log: ConnectionLog;
  now?: () => Date;
}

export interface ReconcileResult {
  enqueued: number;
  /** Cursor for the next batch, or null when the sweep reached the end. */
  next_after_id: string | null;
}

/**
 * The sweep after a database restore (FR-CONN-19): a restore can bring back
 * connections that were revoked or whose tokens rotated since the backup, so every
 * connection is probed and the ones that fail become `needs_reconnect`.
 *
 * It fans out instead of probing inline: each connection gets a health job under
 * its own concurrency key, so a probe that has to refresh can never race a refresh
 * job of the same connection, and a large workspace list is a series of small
 * batches that survive a restart (each batch enqueues the next).
 */
export class ReconcileConnectionsUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: ReconcileDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: { after_id: string | null; batch_size: number; sweep_id: string }): Promise<ReconcileResult> {
    const batch = await this.deps.connections.listActiveAfter(input.after_id, input.batch_size);
    let enqueued = 0;
    for (const connection of batch) {
      const { created } = await this.deps.queue.enqueue(
        {
          job_type: 'connection.health',
          payload: { workspace_id: connection.workspace_id, connection_id: connection.id },
          workspace_id: connection.workspace_id,
          concurrency_key: `connection:${connection.id}`,
          // One probe per connection per sweep, however many times a batch is replayed.
          idempotency_key: `reconcile:${input.sweep_id}:${connection.id}`,
        },
        this.now(),
      );
      if (created) enqueued += 1;
    }
    return {
      enqueued,
      next_after_id: batch.length === input.batch_size ? (batch[batch.length - 1]?.id ?? null) : null,
    };
  }
}
