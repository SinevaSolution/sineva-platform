export type ChatSenderRole = 'user' | 'agent' | 'system';

export interface ChatMessageEntity {
  id: string;
  session_id: string;
  agent_slug: string;
  sender_role: ChatSenderRole;
  message_text: string;
  reasoning_summary: string | null;
  suggested_actions: string[];
  tokens_used: number;
  latency_ms: number;
  created_at: string;
}

export interface ChatSessionEntity {
  id: string;
  workspace_id: string;
  user_id: string;
  agent_slug: string;
  session_title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}
