import type { ChatReplyView } from '@/shared/chat_view';
import type { AiEngineChatResponse } from '../domain/repositories/ai_engine_gateway';

// Compile-time drift guard, same idea as `agent_view_contract.ts`: the chat
// route serialises `AiEngineChatResponse` straight into the response and the
// client types that payload as `ChatReplyView`. If the domain response drops or
// retypes a field the client reads, the type-check fails here instead of the
// browser failing at runtime.
type AssertAssignable<Sub extends Super, Super> = Sub;

export type ChatReplyServedAsView = AssertAssignable<
  AiEngineChatResponse,
  ChatReplyView
>;
