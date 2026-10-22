import type { MessageCardEntity } from '../entities/message_card';

export type NewMessageCard = Omit<MessageCardEntity, 'id' | 'version' | 'created_at' | 'updated_at'>;

export interface MessageCardRepository {
  /** All rows or none: a message never ends up with half of its cards. */
  createMany(cards: NewMessageCard[]): Promise<MessageCardEntity[]>;

  /**
   * Cards of the given messages, ordered by message then position. The
   * workspace is part of the query, so a message id from another tenant
   * returns nothing.
   */
  listByMessageIds(workspaceId: string, messageIds: string[]): Promise<MessageCardEntity[]>;
}
