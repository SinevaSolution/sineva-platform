export type ConversationKind = 'hub' | 'room';

export type ConversationTitleSource = 'user' | 'auto' | 'first_message';

export interface ConversationEntity {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: ConversationKind;
  agent_slug: string | null;
  title: string | null;
  title_source: ConversationTitleSource | null;
  pinned_at: string | null;
  archived_at: string | null;
  origin_message_id: string | null;
  origin_channel: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}
