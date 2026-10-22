import { z } from 'zod';

// Strict on purpose: a workspace or user key in the body is refused, never
// ignored, so a client that thinks it can choose either fails loudly (R-27).
export const startOAuthBodySchema = z
  .object({
    provider_id: z.string().min(1).max(64),
    scope_bundle: z.string().min(1).max(64),
    owner_scope: z.enum(['workspace', 'user']),
    return_to: z.string().min(1).max(512).optional(),
  })
  .strict();

export type StartOAuthBody = z.infer<typeof startOAuthBodySchema>;

// The provider decides what else it sends (`scope`, `authuser`, `prompt`,
// `error_description`); only these four are read and everything else is dropped.
// Lengths are capped so a hostile URL cannot push megabytes into a hash or a lookup.
const param = z.string().max(2048).optional();
export const oauthCallbackQuerySchema = z.object({
  code: param,
  state: param,
  error: z.string().max(128).optional(),
  iss: param,
});

export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
