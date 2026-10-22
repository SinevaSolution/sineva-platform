import { applyIngestUpdate, type ApplyResult } from '@/server/application/library/apply_ingest';
import type { IngestUpdate } from '@/server/application/library/ingest_event_dto';
import type { LibraryDeps } from '@/server/application/library/library_support';

// Ingest progress from sineva-ai (the internal events endpoint). Authenticated
// by the internal key only, so the body is a claim: the tenant must own the
// document, and the event applies only for the document's current job and a
// higher sequence (see `applyIngestUpdate`).
export class ApplyIngestEventUseCase {
  constructor(private readonly deps: LibraryDeps) {}

  execute(update: IngestUpdate, requestId: string): Promise<ApplyResult> {
    return applyIngestUpdate(this.deps, update, requestId);
  }
}
