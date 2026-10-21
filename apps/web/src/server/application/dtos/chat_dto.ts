import { z } from 'zod';

export const sendAgentChatDtoSchema = z.object({
  // sineva-ai ids are UUIDs. Omit on the first turn: sineva-ai creates the
  // session and returns its id in the reply.
  session_id: z.string().uuid().optional(),
  user_id: z.string().min(3).max(128),
  message_text: z.string().min(1, 'message_text is required').max(8000),
  context_metadata: z.record(z.string(), z.unknown()).optional(),
});

export const presignStorageDtoSchema = z.object({
  workspace_id: z.string().min(2).max(128),
  file_name: z.string().min(1).max(255),
  content_type: z.string().min(3).max(128),
  file_size_bytes: z.number().int().positive().max(104_857_600),
});

export type SendAgentChatDto = z.infer<typeof sendAgentChatDtoSchema>;
export type PresignStorageDto = z.infer<typeof presignStorageDtoSchema>;
