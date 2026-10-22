import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';

// A unit-test stand-in for a database transaction: repositories that join
// the scope register an undo step, and a throw inside `run` replays the undo
// steps in reverse, which is what a rollback does to their writes.
export class FakeTransactionRunner implements TransactionRunner {
  private undoStack: Array<() => void> | null = null;
  runs = 0;
  rollbacks = 0;

  get active(): boolean {
    return this.undoStack !== null;
  }

  onRollback(undo: () => void): void {
    this.undoStack?.push(undo);
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    this.undoStack = [];
    try {
      const result = await work();
      this.undoStack = null;
      return result;
    } catch (error) {
      const undo = this.undoStack ?? [];
      this.undoStack = null;
      this.rollbacks += 1;
      for (const step of undo.reverse()) {
        step();
      }
      throw error;
    }
  }
}
