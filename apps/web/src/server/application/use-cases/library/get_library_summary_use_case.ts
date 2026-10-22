import { requireWorkspace, type LibraryDeps } from '@/server/application/library/library_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { documentAccessFor } from '@/server/domain/library/library_access';
import type { LibrarySummaryCounts } from '@/server/domain/repositories/library_repository';

export type LibrarySummary = LibrarySummaryCounts;

/**
 * Counts for the page header and the collections list: how many documents are
 * ready, being read, need a look or could not be read, and how many sit in each
 * collection. Counted over what the caller may see, so a restricted member's
 * numbers never include documents they cannot open.
 */
export class GetLibrarySummaryUseCase {
  constructor(private readonly deps: Pick<LibraryDeps, 'documents'>) {}

  async execute(context: RequestContext): Promise<LibrarySummary> {
    return this.deps.documents.summary(requireWorkspace(context), documentAccessFor(context));
  }
}
