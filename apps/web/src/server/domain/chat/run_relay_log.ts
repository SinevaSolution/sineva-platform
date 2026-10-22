// What the relay reports when something goes wrong. A port so the application
// layer can say "this step failed" without knowing how or where it is logged.
// Details carry the opaque run handle and the failure itself; never text from
// the conversation.

export type RunRelayStep =
  | 'upstream_stream_broke'
  | 'release_stream_failed'
  | 'start_failed'
  | 'release_run_failed'
  | 'bad_frame'
  | 'store_reply_failed'
  | 'store_cards_failed'
  | 'deferred_cancel_failed'
  | 'cancel_before_delete_failed';

export interface RunRelayLog {
  failed(step: RunRelayStep, detail: { run_handle?: string; cause?: unknown }): void;
}
