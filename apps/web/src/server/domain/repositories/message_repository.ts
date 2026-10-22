import type {
  MentionEntity,
  MessageEntity,
  MessageRole,
  MessageStatus,
} from '../entities/message';

export interface CreateMessageInput {
  conversation_id: string;
  role: MessageRole;
  agent_slug?: string | null;
  content: string;
  mentions?: MentionEntity[] | null;
  status?: MessageStatus;
  finish_reason?: string | null;
  run_id?: string | null;
  channel?: string | null;
  client_message_id?: string | null;
}

export interface ListMessagesFilter {
  conversation_id: string;
  cursor?: string;
  limit?: number;
}

export interface MessageRepository {
  create(input: CreateMessageInput): Promise<MessageEntity>;
  findByClientMessageId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageEntity | null>;
  /**
   * The user message a run handle was allocated for (D-M0-3). Assistant
   * messages store the same handle, so the role filter matters.
   */
  findUserMessageByRunId(runId: string): Promise<MessageEntity | null>;
  listByConversation(filter: ListMessagesFilter): Promise<{
    items: MessageEntity[];
    next_cursor: string | null;
  }>;
}
