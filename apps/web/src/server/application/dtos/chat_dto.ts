import { z } from 'zod';

export const presignStorageDtoSchema = z.object({
  file_name: z.string().min(1).max(255),
  content_type: z.string().min(3).max(128),
  file_size_bytes: z.number().int().positive().max(104_857_600),
});

export type PresignStorageDto = z.infer<typeof presignStorageDtoSchema>;
