import { z } from 'zod';

// Strict on purpose: a scheduler has no business sending a workspace or user,
// and silently ignoring one would hide a caller that thinks it can scope a tick.
export const tickJobsRequestSchema = z
  .object({
    max_jobs: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export type TickJobsRequest = z.infer<typeof tickJobsRequestSchema>;

export const rotateVaultKeysRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
