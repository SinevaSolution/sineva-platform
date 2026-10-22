import { z } from 'zod';

// ============================================================================
// Contract v2: Chat Turn Request (FR-AIR-07)
// ============================================================================

export const chatTurnMentionSchema = z.object({
  agent_slug: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const chatTurnAttachmentSchema = z.object({
  storage_key: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
});

export const chatTurnRequestV2Schema = z
  .object({
    user_message: z.string().min(1, 'user_message is required'),
    session_id: z.string().uuid().nullable().optional(),
    client_message_id: z.string().uuid('client_message_id must be a valid UUID'),
    mentions: z.array(chatTurnMentionSchema).default([]),
    attachments: z.array(chatTurnAttachmentSchema).default([]),
    use_library: z.boolean().default(false),
    invoke_skill: z.string().nullable().optional(),
    allow_degraded: z.boolean().default(false),
  })
  .strict();

export type ChatTurnMention = z.infer<typeof chatTurnMentionSchema>;
export type ChatTurnAttachment = z.infer<typeof chatTurnAttachmentSchema>;
export type ChatTurnRequestV2 = z.infer<typeof chatTurnRequestV2Schema>;

// ============================================================================
// Contract v2: Chat Turn Result & Envelope (FR-AIR-08)
// ============================================================================

export const terminalStatusSchema = z.enum([
  'completed',
  'needs_approval',
  'needs_input',
  'budget_exceeded',
  'failed',
]);

export type TerminalStatus = z.infer<typeof terminalStatusSchema>;

export const handoffV2Schema = z.object({
  from_agent_slug: z.string(),
  to_agent_slug: z.string(),
  reason: z.string().optional(),
});

export const modelInfoV2Schema = z.object({
  provider: z.string(),
  model_id: z.string(),
  execution_mode: z.string(),
});

export const usageV2Schema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

export const toolCallV2Schema = z.object({
  tool_name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  result_summary: z.string().nullable().optional(),
});

export const citationV2Schema = z.object({
  document_id: z.string().uuid(),
  title: z.string(),
  similarity_score: z.number(),
  source_uri: z.string().nullable().optional(),
  score_kind: z.string().optional(),
});

export const chatTurnResultV2Schema = z.object({
  run_id: z.string().uuid(),
  message_id: z.string().uuid(),
  session_id: z.string().uuid(),
  agent_slug: z.string(),
  routed_agent_slug: z.string(),
  handoffs: z.array(handoffV2Schema).default([]),
  reply_content: z.string(),
  reply_language: z.string(),
  status: terminalStatusSchema,
  finish_reason: z.string().nullable().optional(),
  model: modelInfoV2Schema,
  execution_mode: z.string(),
  usage: usageV2Schema,
  tool_calls: z.array(toolCallV2Schema).default([]),
  citations: z.array(citationV2Schema).default([]),
  created_at: z.string().datetime({ offset: true }),
});

export type ChatTurnResultV2 = z.infer<typeof chatTurnResultV2Schema>;

export const chatTurnResultEnvelopeV2Schema = z.object({
  success: z.literal(true),
  data: chatTurnResultV2Schema,
});

export type ChatTurnResultEnvelopeV2 = z.infer<typeof chatTurnResultEnvelopeV2Schema>;

// ============================================================================
// Contract v2: SSE Event Vocabulary (FR-AIR-10)
// ============================================================================

export const sseTokenEventSchema = z.object({
  token: z.string(),
});

export const sseHandoffEventSchema = z.object({
  from_slug: z.string(),
  to_slug: z.string(),
  reason: z.string(),
});

export const sseHandoffResultEventSchema = z.object({
  to_slug: z.string(),
  status: z.string(),
});

export const sseToolCallEventSchema = toolCallV2Schema;
export const sseCitationEventSchema = citationV2Schema;

export const sseApprovalRequiredEventSchema = z.object({
  approval_id: z.string(),
  action: z.string(),
  tool_name: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  card_id: z.string().optional(),
});

export const sseCardStartedEventSchema = z.object({
  card_id: z.string(),
  card_type: z.string(),
  schema_version: z.string(),
});

export const sseCardPatchEventSchema = z.object({
  card_id: z.string(),
  patch: z.record(z.string(), z.unknown()),
});

export const sseCardCompletedEventSchema = z.object({
  card_id: z.string(),
  final_payload: z.record(z.string(), z.unknown()),
});

export const sseStepStartedEventSchema = z.object({
  step_id: z.string(),
  step_name: z.string(),
});

export const sseStepCompletedEventSchema = z.object({
  step_id: z.string(),
  step_name: z.string(),
  status: z.string(),
});

export const sseTurnLimitEventSchema = z.object({
  limit: z.number(),
  reached: z.boolean(),
});

export const sseMemoryEventSchema = z.object({
  key: z.string(),
  value: z.unknown(),
});

export const sseMemoryProposalEventSchema = z.object({
  action: z.string(),
  proposal: z.unknown(),
});

export const sseUsageEventSchema = usageV2Schema;
export const sseDoneEventSchema = chatTurnResultV2Schema;

export const sseErrorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const sseEventSchemas = {
  token: sseTokenEventSchema,
  handoff: sseHandoffEventSchema,
  handoff_result: sseHandoffResultEventSchema,
  tool_call: sseToolCallEventSchema,
  citation: sseCitationEventSchema,
  approval_required: sseApprovalRequiredEventSchema,
  card_started: sseCardStartedEventSchema,
  card_patch: sseCardPatchEventSchema,
  card_completed: sseCardCompletedEventSchema,
  step_started: sseStepStartedEventSchema,
  step_completed: sseStepCompletedEventSchema,
  turn_limit: sseTurnLimitEventSchema,
  memory: sseMemoryEventSchema,
  memory_proposal: sseMemoryProposalEventSchema,
  usage: sseUsageEventSchema,
  done: sseDoneEventSchema,
  error: sseErrorEventSchema,
} as const;

export type SseEventName = keyof typeof sseEventSchemas;

export interface ParsedSseMessage {
  id?: string;
  event: string;
  data: unknown;
}

/**
 * Parses raw SSE chunk/text lines into structured SSE messages
 */
export function parseSseTranscript(transcript: string): ParsedSseMessage[] {
  const blocks = transcript.trim().split(/\n\n+/);
  const messages: ParsedSseMessage[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    let id: string | undefined;
    let event = 'message';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataStr = line.slice(5).trim();
      }
    }

    if (dataStr) {
      try {
        const parsedData = JSON.parse(dataStr);
        messages.push({ id, event, data: parsedData });
      } catch {
        messages.push({ id, event, data: dataStr });
      }
    }
  }

  return messages;
}
