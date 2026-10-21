import 'server-only';
import { z } from 'zod';
import type { ParsedSseMessage } from '@/server/domain/chat/chat_v2';

export const terminalStatusSchema = z.enum([
  'completed',
  'needs_approval',
  'needs_input',
  'budget_exceeded',
  'failed',
]);

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

export const chatTurnResultEnvelopeV2Schema = z.object({
  success: z.literal(true),
  data: chatTurnResultV2Schema,
});

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
