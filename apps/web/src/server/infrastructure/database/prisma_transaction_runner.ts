import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionRunner } from '@/server/domain/transactions/transaction_runner';
import type { Prisma, PrismaClient } from './generated/client';

// Why AsyncLocalStorage and not a `tx` argument on every repository method:
// the audit write has to join the transaction of whatever action it records
// (workspace create, key rotation, ...), and threading a transaction handle
// through every port would touch each repository and every fake. The
// trade-off is implicitness: a repository joins the scope only if it reads its
// client through `activeClient`, so an adapter that keeps using `this.prisma`
// silently writes outside the transaction. Adapters used inside a scope must
// opt in.
const scope = new AsyncLocalStorage<Prisma.TransactionClient>();

/** The transaction client of the current scope, or the plain client outside one. */
export function activeClient(prisma: PrismaClient): Prisma.TransactionClient {
  return scope.getStore() ?? prisma;
}

export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaClient) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    // A nested call joins the outer transaction: Postgres has no nested
    // transactions here, and an inner commit must not survive an outer rollback.
    if (scope.getStore()) {
      return work();
    }
    return this.prisma.$transaction((tx) => scope.run(tx, work));
  }
}
