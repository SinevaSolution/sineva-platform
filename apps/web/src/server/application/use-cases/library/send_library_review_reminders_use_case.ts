import type { LibraryDeps } from '@/server/application/library/library_support';
import type { LibraryReviewInbox } from '@/server/domain/library/library_ports';

export interface SendLibraryReviewRemindersDeps extends Pick<LibraryDeps, 'documents' | 'log' | 'now'> {
  inbox: LibraryReviewInbox;
}

/**
 * Overdue review: one "Check if still current" item per document and due date
 * (FR-LIB-22). Idempotent: a document is skipped once `review_reminded_at`
 * passes its `review_due_at`, and a fresh reading or a new interval re-arms it.
 * A failed item is logged and left due, so the next sweep tries again; it
 * never stops the rest of the batch. Runs as a routine once the Inbox backend
 * has an adapter for `LibraryReviewInbox`.
 */
export class SendLibraryReviewRemindersUseCase {
  constructor(private readonly deps: SendLibraryReviewRemindersDeps) {}

  async execute(limit: number): Promise<{ reminded: number; failed: number }> {
    const { documents, inbox, log } = this.deps;
    const now = this.deps.now();
    let reminded = 0;
    let failed = 0;
    for (const document of await documents.listReviewDue(now, limit)) {
      try {
        await inbox.createReviewItem({
          workspace_id: document.workspace_id,
          user_id: document.created_by,
          document_id: document.id,
          action: 'check_if_still_current',
        });
        await documents.update(document.workspace_id, document.id, { review_reminded_at: now });
        reminded += 1;
      } catch {
        failed += 1;
        log.warn('library.review_reminder_failed', { workspace_id: document.workspace_id, document_id: document.id });
      }
    }
    return { reminded, failed };
  }
}
