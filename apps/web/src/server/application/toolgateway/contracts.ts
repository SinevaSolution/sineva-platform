import { z } from 'zod';
const run = z.string().regex(/^run_[0-9a-f-]{36}$/);
export const toolGatewayRequestSchema = z
  .object({
    tool_name: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(128),
    arguments: z
      .record(z.unknown())
      .refine((v) => Buffer.byteLength(JSON.stringify(v)) <= 64 * 1024),
    run_id: run,
    call_id: z.string().min(1).max(128),
    idempotency_key: z.string().min(1).max(200).optional(),
    mode: z.enum(['live', 'simulate']).default('live'),
  })
  .strict();
export const resolveConnectionQuerySchema = z
  .object({
    run_id: run,
    provider_id: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(128),
  })
  .strict();
