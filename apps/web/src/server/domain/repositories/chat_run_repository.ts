import type { ChatRunEntity, ChatRunStatus } from '../entities/chat_run';

export interface FindOrCreateChatRunInput {
  workspace_id: string;
  conversation_id: string;
  user_message_id: string;
  run_handle: string;
  agent_slug: string;
}

export interface ChatRunRepository {
  findByHandle(runHandle: string): Promise<ChatRunEntity | null>;

  /** Idempotent on `run_handle`: two first attaches must see one row. */
  findOrCreate(input: FindOrCreateChatRunInput): Promise<ChatRunEntity>;

  /**
   * `pending` to `streaming` as one conditional update. Only the caller that
   * gets `true` may open the upstream stream, so two tabs (or two instances)
   * can never start two runs for one message.
   */
  claimStart(id: string): Promise<boolean>;

  /** `streaming` back to `pending` after the stream could not be opened. */
  releaseStart(id: string, errorCode: string): Promise<void>;

  recordUpstream(
    id: string,
    ids: { upstream_run_id?: string | null; upstream_session_id?: string | null },
  ): Promise<void>;

  /**
   * Moves the run to a terminal status only if it is currently one of
   * `from`. Returns whether this call won, so exactly one writer stores the
   * assistant message.
   */
  finalize(
    id: string,
    input: { from: ChatRunStatus[]; status: ChatRunStatus; error_code?: string | null },
  ): Promise<boolean>;

  setAssistantMessage(id: string, assistantMessageId: string): Promise<void>;

  /** Every run of a conversation, oldest first. */
  listByConversation(conversationId: string): Promise<ChatRunEntity[]>;

  /** The sineva-ai session of the conversation's latest run that has one. */
  findLatestSessionId(conversationId: string): Promise<string | null>;
}
