import type {
  ConversationEntity,
  ConversationKind,
  ConversationTitleSource,
} from '../entities/conversation';

export interface CreateConversationInput {
  workspace_id: string;
  user_id: string;
  kind: ConversationKind;
  agent_slug?: string | null;
  title?: string | null;
  title_source?: ConversationTitleSource | null;
  origin_message_id?: string | null;
  origin_channel?: string | null;
}

export interface ListConversationsFilter {
  workspace_id: string;
  user_id: string;
  kind?: ConversationKind;
  agent_slug?: string;
  cursor?: string;
  limit?: number;
}

export interface ConversationRepository {
  findById(id: string): Promise<ConversationEntity | null>;
  create(input: CreateConversationInput): Promise<ConversationEntity>;
  list(filter: ListConversationsFilter): Promise<{
    items: ConversationEntity[];
    next_cursor: string | null;
  }>;
  updateLastMessageAt(id: string, date: Date): Promise<void>;
}
