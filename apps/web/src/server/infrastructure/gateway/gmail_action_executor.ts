import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ConnectorHttpClient } from '@/server/domain/connections/connector';
import {
  ConnectorResponseTooLargeError,
  ConnectorUnreachableError,
} from '@/server/domain/connections/connector';
import {
  ToolGatewayError,
  ToolResultTruncatedError,
  type ToolExecutor,
} from '@/server/domain/toolgateway/tool_executor';
import type { SecretPayload } from '@/server/domain/vault/vault';

const ROOT = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
const headerText = z
  .string()
  .min(1)
  .max(250)
  .refine((s) => !/[\r\n\0]/.test(s));
const writeInput = z
  .object({
    to: z.array(z.string().email()).min(1).max(20),
    cc: z.array(z.string().email()).max(20).optional(),
    subject: headerText,
    body_text: z.string().min(1).max(20000),
    reply_to_message_id: id.optional(),
  })
  .strict();
interface Part {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: Part[];
}
const part: z.ZodType<Part> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(part).optional(),
  }),
);
const messageSchema = z.object({
  id,
  threadId: id,
  snippet: z.string().default(''),
  internalDate: z.string().regex(/^\d+$/),
  labelIds: z.array(z.string()).default([]),
  payload: part,
});
type Message = z.infer<typeof messageSchema>;
function header(message: Message, name: string): string {
  return (
    message.payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  );
}
function summary(message: Message) {
  const date = new Date(Number(message.internalDate));
  if (!Number.isFinite(date.getTime())) throw new ToolGatewayError('provider_unavailable', 502);
  return {
    id: message.id,
    thread_id: message.threadId,
    from: header(message, 'from'),
    subject: header(message, 'subject'),
    snippet: message.snippet,
    received_at: date.toISOString(),
    unread: message.labelIds.includes('UNREAD'),
  };
}
function plainText(node: Part, depth = 0): string {
  if (depth > 20 || node.filename) return '';
  if (node.mimeType === 'text/plain' && node.body?.data)
    return Buffer.from(node.body.data, 'base64url').toString('utf8');
  return (node.parts ?? [])
    .map((p) => plainText(p, depth + 1))
    .filter(Boolean)
    .join('\n');
}
function encodeSubject(text: string): string {
  const words: string[] = [];
  let chunk = '';
  for (const character of text) {
    if (Buffer.byteLength(chunk + character) > 42) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`);
  return words.join('\r\n ');
}

function checked<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  code: string,
  status: number,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ToolGatewayError(code, status);
  return parsed.data;
}

/** Uses Gmail's base64url RFC 2822 API. Never retries a provider write. */
export class GmailActionExecutor implements ToolExecutor {
  constructor(private readonly http: ConnectorHttpClient) {}

  supports(action: string): boolean {
    return [
      'gmail_search_messages',
      'gmail_get_message',
      'gmail_create_draft',
      'gmail_send_message',
    ].includes(action);
  }

  endpoint(action: string): string {
    if (!this.supports(action)) throw new ToolGatewayError('action_not_allowed');
    return `${ROOT}${action === 'gmail_create_draft' ? 'drafts' : action === 'gmail_send_message' ? 'messages/send' : 'messages'}`;
  }

  async execute(
    action: string,
    args: Record<string, unknown>,
    credentials: SecretPayload,
    callId: string,
    source?: { external_account_id: string | null; account_label: string | null },
  ): Promise<Record<string, unknown>> {
    this.endpoint(action);
    const token = credentials.access_token;
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token))
      throw new ToolGatewayError('connection_needs_reconnect', 409);
    if (action === 'gmail_search_messages') {
      const input = checked(
        z
          .object({
            query: z.string().max(500).default(''),
            max_results: z.number().int().min(1).max(25).default(10),
          })
          .strict(),
        args,
        'invalid_tool_arguments',
        422,
      );
      const url = new URL(`${ROOT}messages`);
      url.searchParams.set('q', input.query);
      url.searchParams.set('maxResults', String(input.max_results));
      const listed = checked(
        z.object({ messages: z.array(z.object({ id })).max(25).default([]) }),
        await this.request(url.toString(), token),
        'provider_unavailable',
        502,
      );
      const messages = [];
      const entries = listed.messages.slice(0, input.max_results);
      for (let offset = 0; offset < entries.length; offset += 5) {
        const batch = await Promise.all(
          entries
            .slice(offset, offset + 5)
            .map(async (entry) => summary(await this.getMessage(entry.id, token, 'metadata'))),
        );
        messages.push(...batch);
      }
      return { messages };
    }
    if (action === 'gmail_get_message') {
      const input = checked(
        z.object({ message_id: id }).strict(),
        args,
        'invalid_tool_arguments',
        422,
      );
      const message = await this.getMessage(input.message_id, token, 'full');
      const text = plainText(message.payload);
      return {
        ...summary(message),
        to: (message.payload.headers ?? [])
          .filter((h) => h.name.toLowerCase() === 'to')
          .map((h) => h.value),
        body_text: text || message.snippet,
        body_source: text ? 'plain_text' : 'snippet',
      };
    }
    const input = checked(writeInput, args, 'invalid_tool_arguments', 422);
    const from = checked(
      z.string().email(),
      source?.account_label,
      'connection_needs_reconnect',
      409,
    );
    let reply: Message | undefined;
    if (input.reply_to_message_id)
      reply = await this.getMessage(input.reply_to_message_id, token, 'metadata');
    const lines = [
      `From: ${from}`,
      `To: ${input.to.join(', ')}`,
      ...(input.cc?.length ? [`Cc: ${input.cc.join(', ')}`] : []),
      `Subject: ${encodeSubject(input.subject)}`,
      `Message-ID: <${createHash('sha256').update(callId).digest('hex')}@sineva.id>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ];
    if (reply) {
      const originalId = header(reply, 'message-id');
      if (!/^<[^<>\s]+>$/.test(originalId)) throw new ToolGatewayError('provider_unavailable', 502);
      lines.push(`In-Reply-To: ${originalId}`, `References: ${originalId}`);
    }
    const content =
      Buffer.from(input.body_text)
        .toString('base64')
        .match(/.{1,76}/g)
        ?.join('\r\n') ?? '';
    const message = {
      raw: Buffer.from(`${lines.join('\r\n')}\r\n\r\n${content}\r\n`).toString('base64url'),
      ...(reply ? { threadId: reply.threadId } : {}),
    };
    const result = await this.request(
      this.endpoint(action),
      token,
      action === 'gmail_create_draft' ? { message } : message,
    );
    if (action === 'gmail_create_draft') {
      const draft = checked(
        z.object({ id, message: z.object({ id }) }),
        result,
        'tool_outcome_unknown',
        503,
      );
      return { draft_id: draft.id, message_id: draft.message.id };
    }
    const sent = checked(z.object({ id, threadId: id }), result, 'tool_outcome_unknown', 503);
    return { message_id: sent.id, thread_id: sent.threadId };
  }

  private async getMessage(
    messageId: string,
    token: string,
    format: 'full' | 'metadata',
  ): Promise<Message> {
    return checked(
      messageSchema,
      await this.request(
        `${ROOT}messages/${encodeURIComponent(messageId)}?format=${format}`,
        token,
      ),
      'provider_unavailable',
      502,
    );
  }

  private async request(url: string, token: string, body?: unknown): Promise<unknown> {
    let response;
    try {
      response = await this.http.request({
        provider_id: 'gmail',
        method: body ? 'POST' : 'GET',
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (error instanceof ConnectorResponseTooLargeError)
        throw new ToolResultTruncatedError(error.limit_bytes);
      if (error instanceof ConnectorUnreachableError)
        throw new ToolGatewayError(body ? 'tool_outcome_unknown' : 'provider_unavailable', 503);
      throw error;
    }
    if (response.status === 401)
      throw new ToolGatewayError('connection_needs_reconnect', 409, true);
    if (response.status === 429) throw new ToolGatewayError('rate_limited', 429, true);
    if (response.status < 200 || response.status >= 300)
      throw new ToolGatewayError(
        body && response.status >= 500 ? 'tool_outcome_unknown' : 'provider_unavailable',
        body && response.status >= 500 ? 503 : 502,
        response.status >= 400 && response.status < 500,
      );
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      throw new ToolGatewayError(
        body ? 'tool_outcome_unknown' : 'provider_unavailable',
        body ? 503 : 502,
      );
    }
  }
}
