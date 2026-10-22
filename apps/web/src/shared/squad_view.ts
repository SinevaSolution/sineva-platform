// JSON contract for squads as the browser sees it. Client code may import this
// file but never `@/server/*`.

import type { ConversationView, MessageView } from './chat_view';

export type SquadLeadTypeView = 'sino' | 'member';

export interface SquadMemberView {
  agent_slug: string;
  position: number;
}

/** Why a squad cannot take turns right now (FR-SQD-26). */
export interface SquadAttentionView {
  reason: 'member_disabled' | 'lead_removed' | 'connection_missing';
  agent_slug: string | null;
}

export interface SquadView {
  id: string;
  name: string;
  goal: string;
  lead_type: SquadLeadTypeView;
  lead_agent_slug: string | null;
  template_slug: string | null;
  status: 'active' | 'archived';
  members: SquadMemberView[];
  /** Null when the roster could not be read: say so, do not claim all is well. */
  attention: SquadAttentionView[] | null;
  /** `ask_admin` means the person cannot use every member and has no override. */
  my_access: 'open' | 'ask_admin';
  can_edit: boolean;
  /** "Up to N points" for a turn the lead routes. */
  ceiling_points: number;
  created_at: string;
  updated_at: string;
}

export interface SquadTemplateView {
  slug: string;
  name: string;
  goal: string;
  member_slugs: string[];
  lead_type: SquadLeadTypeView;
  starter_prompts: string[];
  library_folders: string[];
}

export type SquadHandoffStatusView = 'working' | 'done' | 'needs_review' | 'failed';

export interface SquadHandoffView {
  delegation_id: string;
  position: number;
  from_slug: string;
  to_slug: string;
  task_summary: string;
  parallel_group: number | null;
  status: SquadHandoffStatusView;
  summary: string | null;
  error_code: string | null;
  points: number | null;
}

export type SquadCapView = 'cap_delegations' | 'cap_tokens' | 'cap_time' | 'cap_credits';

export interface SquadTurnView {
  run_handle: string;
  lead_slug: string;
  direct_slug: string | null;
  ceiling_points: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  termination_reason: 'done' | SquadCapView | 'error' | 'cancelled' | null;
  delegation_count: number;
  points: number | null;
  created_at: string;
  finished_at: string | null;
  handoffs: SquadHandoffView[];
}

export interface SquadSessionDetailView {
  conversation: ConversationView;
  messages: MessageView[];
  next_cursor: string | null;
  turns: SquadTurnView[];
}

export interface SquadMessageResultView {
  message_id: string;
  run_id: string;
  conversation_id: string;
  status: string;
  /** Null for a direct @SinoX: no pre-estimate (FR-BILL-05). */
  ceiling_points: number | null;
}
