/**
 * Runs `work` so that every repository write it makes commits or rolls back
 * together. The scope travels implicitly (the adapter binds it to the async
 * call chain), which keeps repository signatures free of a transaction
 * argument; the cost is that a repository only joins the scope if its adapter
 * opts in, so adapters used inside a scope must read the active client.
 */
export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/** For unit tests and call sites with nothing to make atomic: runs `work` as is. */
export const noTransaction: TransactionRunner = {
  run: (work) => work(),
};
