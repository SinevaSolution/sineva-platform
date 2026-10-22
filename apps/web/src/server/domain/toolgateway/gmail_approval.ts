import { z } from 'zod';
export const GMAIL_APPROVAL_TYPES: Readonly<Record<string, string>> = {
  gmail_search_messages: 'email.search',
  gmail_get_message: 'email.read',
  gmail_create_draft: 'email.draft.create',
  gmail_send_message: 'email.send',
};
export const gatewayApprovalPayloadSchema = z
  .object({
    gateway_call_id: z.string().uuid(),
    connection_id: z.string().uuid(),
    external_account_id: z.string().max(254).nullable().optional(),
    account_label: z.string().max(254).nullable().optional(),
    request: z
      .object({
        tool_name: z.enum([
          'gmail_search_messages',
          'gmail_get_message',
          'gmail_create_draft',
          'gmail_send_message',
        ]),
        arguments: z
          .record(z.unknown())
          .refine((v) => Buffer.byteLength(JSON.stringify(v)) <= 65536),
        run_id: z.string().regex(/^run_[0-9a-f-]{36}$/),
        call_id: z.string().min(1).max(128),
        mode: z.enum(['live', 'simulate']),
      })
      .strict(),
  })
  .strict();
