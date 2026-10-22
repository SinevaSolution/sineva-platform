import type { AgentCatalog } from '@/server/domain/specialists/agent_catalog';
import type {
  ChatTurnRequestV2,
  ChatTurnResultV2,
  ParsedSseMessage,
} from '@/server/domain/chat/chat_v2';

// Contract v2 Gateway Call Types (WP-M0-28, FR-AIR-05 to FR-AIR-09)
export interface ChatTurnCallOptions {
  agentSlug: string;
  request: ChatTurnRequestV2;
  contextToken: string;
  requestId?: string;
  traceparent?: string;
}

export interface StreamCallOptions {
  agentSlug: string;
  request: ChatTurnRequestV2;
  contextToken: string;
  requestId?: string;
  traceparent?: string;
}

export interface SquadStreamCallOptions {
  squadId: string;
  request: ChatTurnRequestV2;
  /** Signed context carrying the `squad` claim (ADR-0044). */
  contextToken: string;
  requestId?: string;
  traceparent?: string;
}

export interface RunEventsResult {
  run_id: string;
  events: ParsedSseMessage[];
  has_more: boolean;
}

export interface CancelRunResult {
  run_id: string;
  status: string;
  cancelled_at: string;
}

// Resume of a paused run (ADR-0032). Proposed platform contract, pending
// sineva-ai; the shapes are pinned by the approval_*.json fixtures.
export type ResumeApprovalDecision = 'approved' | 'rejected' | 'changes_requested' | 'expired';
export type ResumeInputDecision = 'answered' | 'dismissed' | 'expired';

export interface ResumeApprovalBody {
  kind: 'approval';
  approval_id: string;
  revision: number;
  decision: ResumeApprovalDecision;
  decided_at: string;
  payload_hash: string;
  edited: boolean;
  /** Only with `changes_requested`: what the person asked the specialist to change. */
  instruction?: string;
  /** Only with `rejected`. */
  note?: string;
  /** `executed` is always false for `draft.review`: approving marks it ready, nothing is sent. */
  result: { executed: boolean };
}

export interface ResumeInputBody {
  kind: 'input_request';
  input_request_id: string;
  decision: ResumeInputDecision;
  decided_at: string;
  /** Only with `answered`. */
  answers?: Record<string, unknown>;
}

export type ResumeRunBody = ResumeApprovalBody | ResumeInputBody;

export interface ResumeRunOptions {
  runId: string;
  body: ResumeRunBody;
  /** Same key for the same decision, so a retry cannot resume twice. */
  idempotencyKey: string;
  contextToken: string;
  requestId?: string;
  traceparent?: string;
}

export interface ResumeRunResult {
  run_id: string;
  status: string;
}

// Legacy Contract v1 shapes (retained for backward compatibility during transition)
export interface AiEngineChatRequest {
  agent_slug: string;
  session_id?: string;
  user_id: string;
  message_text: string;
  context_metadata?: Record<string, unknown>;
  request_id?: string;
}

export interface AiEngineToolCall {
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary: string | null;
}

export interface AiEngineCitation {
  document_id: string;
  title: string;
  similarity_score: number;
  source_uri: string | null;
}

export interface AiEngineChatResponse {
  message_id: string;
  session_id: string;
  agent_slug: string;
  display_name: string;
  handle: string;
  routed_agent_slug: string;
  reply_content: string;
  model_id: string;
  execution_mode: string;
  token_usage: Record<string, number>;
  tool_calls: AiEngineToolCall[];
  citations: AiEngineCitation[];
  created_at: string;
  latency_ms: number;
}

export interface AiEngineHealthResult {
  is_reachable: boolean;
  internal_url: string;
  latency_ms: number;
  engine_version: string;
}

export interface AiEngineGateway {
  // Contract v2 methods
  chatTurn(options: ChatTurnCallOptions): Promise<ChatTurnResultV2 & { latency_ms: number }>;
  chatStream(options: StreamCallOptions): Promise<ReadableStream<Uint8Array>>;
  squadChatStream(options: SquadStreamCallOptions): Promise<ReadableStream<Uint8Array>>;
  listAgents(options: {
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<AgentCatalog>;
  getRunEvents(options: {
    runId: string;
    afterSeq?: number;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<RunEventsResult>;
  cancelRun(options: {
    runId: string;
    contextToken?: string;
    requestId?: string;
    traceparent?: string;
  }): Promise<CancelRunResult>;

  resumeRun(options: ResumeRunOptions): Promise<ResumeRunResult>;

  // Health probe
  checkHealth(): Promise<AiEngineHealthResult>;

  // Legacy v1 interface
  dispatchAgentChat(payload: AiEngineChatRequest): Promise<AiEngineChatResponse>;
}
