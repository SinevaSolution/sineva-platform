import 'server-only';

// OpenAPI paths of the connection layer: the internal job routes (ADR-0038)
// and the Connections API (ADR-0037, ADR-0039). `spec.ts` spreads it in.

const envelope = { $ref: '#/components/schemas/StandardEnvelope' };
const json = { 'application/json': { schema: envelope } };
const response = (description: string) => ({ description, content: json });

function internalPaths(
  path: string,
  method: 'get' | 'post',
  operation: Record<string, unknown>,
  // A scheduler that can only issue GET (Vercel Cron) triggers the same job.
  options: { alsoGet?: boolean } = {},
): Array<[string, unknown]> {
  return [path, `/api${path}`].map((p) => {
    const operationId = (suffix: string) =>
      p.startsWith('/api') ? `${operation.operationId as string}${suffix}_api_alias` : `${operation.operationId as string}${suffix}`;
    return [
      p,
      {
        [method]: { ...operation, operationId: operationId('') },
        ...(options.alsoGet ? { get: { ...operation, operationId: operationId('_get') } } : {}),
      },
    ];
  });
}

const WS = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const CONNECTION = { name: 'connection_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const COMMON_ERRORS = {
  '401': response('Not signed in'),
  '403': response('Role lacks the permission, or a bearer token minted for another audience'),
  '404': response('Not found, not visible to this person, or another workspace'),
};

export function getConnectionsPaths(): Record<string, unknown> {
  return {
    '/api/v1/workspaces/{workspace_id}/connections/oauth/start': {
      post: {
        tags: ['Connections'],
        summary: 'Start connecting a tool with a sign-in',
        description:
          'Creates a one-time flow (10 minutes) bound to the session and returns the provider URL; the app shows its consent screen first, then sends the browser there. Workspace and user come from the session and the path, never the body (a user_id or workspace_id key is a 422). owner_scope workspace needs connection.connect_workspace (owner, admin); user needs connection.connect_personal and a provider that allows personal connections. return_to must be a path under /w/. Details and result codes: docs/api-spec/connections_endpoints.md.',
        operationId: 'start_connection_oauth',
        parameters: [WS],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['provider_id', 'scope_bundle', 'owner_scope'],
                properties: {
                  provider_id: { type: 'string' },
                  scope_bundle: { type: 'string' },
                  owner_scope: { type: 'string', enum: ['workspace', 'user'] },
                  return_to: { type: 'string', description: 'Relative path starting with /w/' },
                },
              },
            },
          },
        },
        responses: {
          '200': response('flow_id, authorization_url, expires_at'),
          ...COMMON_ERRORS,
          '409': response('provider_coming_soon or provider_not_configured'),
          '422': response('Validation failed, unknown scope bundle, unsafe return_to, or owner_scope_not_allowed'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/providers': {
      get: {
        tags: ['Connections'],
        summary: 'The catalog of connectable tools',
        description:
          'Every provider with its status, availability (a provider without credentials here is listed as unavailable with a reason), scope bundles with plain-language labels in English and Indonesian, the fields to paste for pasted-key providers, and what the caller may connect. Returns ProviderView[] (src/shared/connection_view.ts).',
        operationId: 'list_connection_providers',
        parameters: [WS],
        responses: { '200': response('providers'), ...COMMON_ERRORS },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections': {
      get: {
        tags: ['Connections'],
        summary: 'List connections',
        description:
          'Workspace connections and the caller\'s own personal ones. Another member\'s personal connection is never listed, for any role. Revoked tombstones appear only with status=revoked. Returns ConnectionView[] with the access matrix and per-role can flags.',
        operationId: 'list_connections',
        parameters: [
          WS,
          { name: 'provider_id', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['connected', 'partial', 'needs_reconnect', 'error', 'revoked'] } },
        ],
        responses: { '200': response('connections'), ...COMMON_ERRORS, '422': response('Invalid filter') },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/secret': {
      post: {
        tags: ['Connections'],
        summary: 'Connect a pasted-key tool, or replace its key',
        description:
          'The key is tested with the provider before anything is stored; a failed test stores nothing (422 connection_test_failed with invalid_credentials or insufficient_permissions, 503 provider_unreachable). It travels in this body only, goes to the vault and is never returned. With connection_id the key of that connection is replaced (connection.secret_rotated). Owner and admin only. 201 for a new connection, 200 for a replaced key.',
        operationId: 'save_connection_secret',
        parameters: [WS],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['provider_id', 'secret'],
                properties: {
                  provider_id: { type: 'string' },
                  owner_scope: { type: 'string', enum: ['workspace'] },
                  connection_id: { type: 'string', format: 'uuid' },
                  secret: { type: 'object', additionalProperties: { type: 'string' }, description: 'The provider field_keys from credential_fields' },
                },
              },
            },
          },
        },
        responses: {
          '200': response('Key replaced: { connection }'),
          '201': response('Connected: { connection }'),
          ...COMMON_ERRORS,
          '409': response('provider_not_configured, provider_coming_soon or connection_revoked'),
          '422': response('Validation failed, connection_test_failed, or owner_scope_not_allowed'),
          '503': response('provider_unreachable or vault_unavailable'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/{connection_id}': {
      get: {
        tags: ['Connections'],
        summary: 'One connection with its access matrix',
        operationId: 'get_connection',
        parameters: [WS, CONNECTION],
        responses: { '200': response('{ connection }'), ...COMMON_ERRORS },
      },
      delete: {
        tags: ['Connections'],
        summary: 'Disconnect',
        description:
          'Revokes at the provider (best effort), erases the secret, tombstones the row, removes the grants and audits connection.revoked. Owner and admin; a member only their own personal connection. Repeating it answers with the first revocation. Returns { id, status, revoked_at, provider_revoked }.',
        operationId: 'disconnect_connection',
        parameters: [WS, CONNECTION],
        responses: { '200': response('Disconnected'), ...COMMON_ERRORS, '503': response('vault_unavailable: nothing changed, try again') },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/reconnect': {
      post: {
        tags: ['Connections'],
        summary: 'Start a new sign-in for a connection, keeping its id',
        description:
          'Optional body { scope_bundle?, return_to? }; a wider bundle adds scopes (incremental consent). Pasted-key connections answer 409 not_reconnectable: replace the key instead. Returns { flow_id, authorization_url, expires_at }.',
        operationId: 'reconnect_connection',
        parameters: [WS, CONNECTION],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { scope_bundle: { type: 'string' }, return_to: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': response('flow_id, authorization_url, expires_at'), ...COMMON_ERRORS, '409': response('connection_revoked or not_reconnectable'), '422': response('Validation failed') },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/test': {
      post: {
        tags: ['Connections'],
        summary: 'Run the health probe now',
        description:
          'Updates last_health_at and last_error_code and answers { result, status, error_code, checked_at }. It never refreshes a token: an expired token is reported as token_expired. A rejected credential becomes needs_reconnect.',
        operationId: 'test_connection',
        parameters: [WS, CONNECTION],
        responses: { '200': response('Probe result'), ...COMMON_ERRORS, '409': response('connection_revoked') },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/grants': {
      put: {
        tags: ['Connections'],
        summary: 'Replace the access matrix',
        description:
          'Body { grants: [{ agent_slug, read, write }] }, one row per specialist at most; unlisted specialists lose access. write needs read; unknown slugs are unknown_specialist; write on a read-only tool is write_not_supported. Owner and admin only (connection.grant). Returns the full matrix.',
        operationId: 'update_connection_grants',
        parameters: [WS, CONNECTION],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['grants'],
                properties: {
                  grants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['agent_slug', 'read', 'write'],
                      properties: { agent_slug: { type: 'string' }, read: { type: 'boolean' }, write: { type: 'boolean' } },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '200': response('{ grants }'), ...COMMON_ERRORS, '409': response('connection_revoked'), '422': response('Validation failed') },
      },
    },
    '/api/v1/workspaces/{workspace_id}/connections/{connection_id}/activity': {
      get: {
        tags: ['Connections'],
        summary: 'Audit events of one connection',
        description: 'Cursor-paginated, newest first: id, time, action, outcome, actor type and reason code. No payloads. Owner and admin only.',
        operationId: 'list_connection_activity',
        parameters: [
          WS,
          CONNECTION,
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: { '200': response('{ events, next_cursor }'), ...COMMON_ERRORS, '422': response('Invalid query') },
      },
    },
    '/api/v1/connections/oauth/callback': {
      get: {
        tags: ['Connections'],
        summary: 'Provider redirect target for a connection flow',
        description:
          'Called by the provider through the browser (a cross-site GET; the session cookie is SameSite=Lax). Consumes the one-time state, checks expiry, the session binding, the role and iss, then redeems the code server side. Never returns JSON: every outcome is a 302 to a path in the app with connection_result (connected, partial, reconnected, denied, duplicate_account, different_account, expired, error) and, when known, provider_id and connection_id.',
        operationId: 'oauth_connection_callback',
        parameters: [
          { name: 'code', in: 'query', schema: { type: 'string' } },
          { name: 'state', in: 'query', schema: { type: 'string' } },
          { name: 'error', in: 'query', schema: { type: 'string' } },
          { name: 'iss', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '302': { description: 'Redirect to the return path with connection_result' } },
      },
    },
    ...Object.fromEntries([
      ...internalPaths('/internal/v1/jobs/tick', 'post', {
        tags: ['Internal'],
        summary: 'Run one job scheduler beat',
        description:
          'Guarded by X-Internal-Api-Key or by Authorization: Bearer CRON_SECRET (the form Vercel Cron sends; GET exists because Vercel Cron only issues GET). Plans due jobs (idempotent), takes back jobs whose worker died, then runs up to max_jobs ready jobs. Optional body {max_jobs: 1 to 100, default 25}. Call about once a minute; safe to call repeatedly.',
        operationId: 'run_job_tick',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { max_jobs: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
              },
            },
          },
        },
        responses: {
          '200': response('Counts: planned, reaped, ran, succeeded, retried, failed, planner_errors'),
          '401': response('Missing or invalid X-Internal-Api-Key header or cron bearer token'),
          '422': response('Body failed validation'),
        },
      }, { alsoGet: true }),
      ...internalPaths('/internal/v1/connections/reconcile', 'post', {
        tags: ['Internal'],
        summary: 'Queue the connection sweep after a restore',
        description:
          'Guarded by X-Internal-Api-Key. Runbook command: after any database restore, probes every connection and marks the ones that fail as needing a reconnect. Takes no body, answers 202 with the first job id; later batches queue themselves.',
        operationId: 'queue_connection_reconcile',
        responses: {
          '202': response('job_id of the first batch'),
          '401': response('Missing or invalid X-Internal-Api-Key header'),
        },
      }),
      ...internalPaths('/internal/v1/connections/mass-revoke', 'post', {
        tags: ['Internal'],
        summary: 'Revoke every connection of one provider (incident runbook)',
        description:
          'Guarded by X-Internal-Api-Key. Body { provider_id, confirm: "revoke-all:<provider_id>", limit?: 1 to 200, default 100 }. Revokes and erases every active connection of the provider in every workspace, as the system, in batches; call again while more is true. Each connection is audited like a disconnect.',
        operationId: 'mass_revoke_connections',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['provider_id', 'confirm'],
                properties: {
                  provider_id: { type: 'string' },
                  confirm: { type: 'string' },
                  limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
                },
              },
            },
          },
        },
        responses: {
          '200': response('revoked, more'),
          '401': response('Missing or invalid X-Internal-Api-Key header'),
          '404': response('Unknown provider'),
          '422': response('Body failed validation or the confirmation does not match'),
          '503': response('The vault could not erase a secret; the batch stopped'),
        },
      }),
      ...internalPaths('/internal/v1/vault/rotate-keys', 'post', {
        tags: ['Internal'],
        summary: 'Rewrap vault data keys under the current key',
        description:
          'Guarded by X-Internal-Api-Key. Runbook command for key rotation: rewraps up to limit (1 to 500, default 100) data keys that the current key did not wrap. Ciphertext is untouched and no secret is decrypted. Repeat until more is false and failed is 0, then retire the old key.',
        operationId: 'rotate_vault_keys',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
              },
            },
          },
        },
        responses: {
          '200': response('rotated, skipped, failed, more'),
          '401': response('Missing or invalid X-Internal-Api-Key header'),
          '422': response('Body failed validation'),
          '503': response('The vault or its key service is not available'),
        },
      }),
      ...internalPaths('/internal/v1/jobs/stats', 'get', {
        tags: ['Internal'],
        summary: 'Job queue depth',
        description:
          'Guarded by X-Internal-Api-Key. Reads the queue itself: queued, running and failed counts and the age in seconds of the oldest due job.',
        operationId: 'get_job_stats',
        responses: {
          '200': response('queued, running, failed, oldest_due_seconds'),
          '401': response('Missing or invalid X-Internal-Api-Key header'),
        },
      }),
    ]),
  };
}
