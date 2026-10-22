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
  /**
   * Sets the title and marks it as the person's own (`title_source = 'user'`),
   * so a later automatic title never overwrites it.
   */
  rename(id: string, title: string): Promise<ConversationEntity>;
  /**
   * Hard delete. Messages and chat runs go with it through the foreign keys'
   * `ON DELETE CASCADE`; no soft-delete flag exists on purpose (the person
   * asked for the data to be gone).
   */
  delete(id: string): Promise<void>;
}
