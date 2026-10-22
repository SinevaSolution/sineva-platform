// What the Inbox use cases report when a step fails but the action goes on
// (a resume that will be retried, a stale claim). A port so the application
// layer does not know how it is logged. Details carry opaque ids only, never
// draft text, answers or names.

export type InboxStep =
  | 'expiry_resume_failed'
  | 'expiry_item_failed'
  | 'release_claim_failed'
  | 'relay_item_failed';

export interface InboxLog {
  failed(step: InboxStep, detail: { workspace_id?: string; run_handle?: string; cause?: unknown }): void;
}
