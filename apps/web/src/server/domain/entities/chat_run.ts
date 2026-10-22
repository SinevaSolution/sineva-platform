// A chat run as the platform tracks it (ADR-0022): the browser's handle, the
// sineva-ai ids it maps to, and where the run is in its life.

export type ChatRunStatus =
  /** Handle allocated; no upstream stream has been started (or the start failed). */
  | 'pending'
  | 'streaming'
  | 'completed'
  | 'cancelled'
  | 'error'
  | 'needs_approval'
  | 'needs_input'
  | 'budget_exceeded'
  | 'failed';

export const TERMINAL_RUN_STATUSES: ReadonlyArray<ChatRunStatus> = [
  'completed',
  'cancelled',
  'error',
  'needs_approval',
  'needs_input',
  'budget_exceeded',
  'failed',
];

export function isTerminalRunStatus(status: ChatRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export interface ChatRunEntity {
  id: string;
  workspace_id: string;
  conversation_id: string;
  user_message_id: string;
  /** `run_<uuid>`, allocated by POST .../messages (D-M0-3). */
  run_handle: string;
  agent_slug: string;
  status: ChatRunStatus;
  /** sineva-ai `run_id`; null until the stream reports it. */
  upstream_run_id: string | null;
  /** sineva-ai `session_id`; reused by the next turn of the conversation. */
  upstream_session_id: string | null;
  assistant_message_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}
