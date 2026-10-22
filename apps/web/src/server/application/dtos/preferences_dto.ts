import { z } from 'zod';
import { DENSITIES, THEMES } from '@/server/domain/entities/user_preferences';

// Strict for the same reason as the profile body: an unknown key is a client
// bug (or an attempt to write someone else's row), not something to drop.
export const UpdatePreferencesSchema = z
  .object({
    theme: z.enum(THEMES).optional(),
    density: z.enum(DENSITIES).optional(),
    focus_mode: z.boolean().optional(),
    reduce_motion: z.boolean().optional(),
    sidebar_collapsed: z.boolean().optional(),
    pause_character: z.boolean().optional(),
    room_view: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one preference to update',
  });

export type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>;
