import type {
  ChatReplyView,
  ConversationView,
  MessageView,
} from '@/shared/chat_view';
import type { AiEngineChatResponse } from '../domain/repositories/ai_engine_gateway';
import type { ConversationEntity } from '../domain/entities/conversation';
import type { MessageEntity } from '../domain/entities/message';

// Compile-time drift guard: ensures domain entities are assignable to shared views
type AssertAssignable<Sub extends Super, Super> = Sub;

export type ChatReplyServedAsView = AssertAssignable<
  AiEngineChatResponse,
  ChatReplyView
>;

export type ConversationServedAsView = AssertAssignable<
  ConversationEntity,
  ConversationView
>;

export type MessageServedAsView = AssertAssignable<
  MessageEntity,
  MessageView
>;
