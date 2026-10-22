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

const connectionStatus = z.enum(['connected', 'partial', 'needs_reconnect', 'error', 'revoked']);

export const listConnectionsQuerySchema = z.object({
  provider_id: z.string().min(1).max(64).optional(),
  status: connectionStatus.optional(),
});

// The secret is a flat map of the provider's own field names. The use case checks
// the names against the provider's field list and refuses unknown ones.
export const saveSecretBodySchema = z
  .object({
    provider_id: z.string().min(1).max(64),
    owner_scope: z.enum(['workspace', 'user']).optional(),
    connection_id: z.string().uuid().optional(),
    secret: z.record(z.string().min(1).max(64), z.string().max(4096)).refine((value) => Object.keys(value).length <= 8, {
      message: 'Too many fields',
    }),
  })
  .strict();

export type SaveSecretBody = z.infer<typeof saveSecretBodySchema>;

export const reconnectBodySchema = z
  .object({
    scope_bundle: z.string().min(1).max(64).optional(),
    return_to: z.string().min(1).max(512).optional(),
  })
  .strict();

export const grantsBodySchema = z
  .object({
    grants: z
      .array(
        z
          .object({
            agent_slug: z.string().min(1).max(64),
            read: z.boolean(),
            write: z.boolean(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export const activityQuerySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Mass revoke is an incident command: the confirmation is part of the body so a
// stray call cannot revoke anything.
export const massRevokeRequestSchema = z
  .object({
    provider_id: z.string().min(1).max(64),
    confirm: z.string().min(1).max(100),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .strict();
