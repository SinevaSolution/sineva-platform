// Small ports the Library use cases need next to the repositories and the
// ingest gateway.

export type LibraryLogEvent =
  | 'library.ingest_request_failed'
  | 'library.ingest_event_ignored'
  | 'library.delete_unverified'
  | 'library.retrieval_rejected'
  | 'library.acl_sync_failed'
  | 'library.review_reminder_failed'
  | 'library.cleanup_failed';

/** Ids, codes and counts only: never document text, titles or file names. */
export interface LibraryLogFields {
  workspace_id?: string;
  document_id?: string;
  reason?: string;
  status?: number;
  count?: number;
}

export interface LibraryLog {
  warn(event: LibraryLogEvent, fields: LibraryLogFields): void;
}

/**
 * Creates the "Check if still current" item for a document whose review is
 * due. The Inbox backend (WP-M1-40) implements it; until then the reminder
 * sweep has no adapter and runs only in tests.
 */
export interface LibraryReviewInbox {
  createReviewItem(input: {
    workspace_id: string;
    user_id: string;
    document_id: string;
    action: 'check_if_still_current';
  }): Promise<void>;
}
