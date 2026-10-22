import { randomUUID } from 'node:crypto';
import type { JobQueue } from '@/server/domain/jobs/job_queue';

/**
 * The runbook command behind "after any restore, probe every connection"
 * (FR-CONN-19): queues the first batch of a sweep. The batches after it queue
 * themselves, so this is the only call an operator makes.
 */
export class EnqueueConnectionReconcileUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: { queue: JobQueue; now?: () => Date }) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(): Promise<{ job_id: string }> {
    // A fresh sweep id every time: a second restore next month must not be
    // swallowed by the idempotency keys of the first sweep.
    const sweepId = randomUUID();
    const { job } = await this.deps.queue.enqueue(
      { job_type: 'connection.reconcile', payload: { after_id: null, sweep_id: sweepId } },
      this.now(),
    );
    return { job_id: job.id };
  }
}
