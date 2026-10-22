import 'server-only';

// OpenAPI paths of the connection layer: the internal job routes (ADR-0038)
// and the Connections API (ADR-0037, ADR-0039). `spec.ts` spreads it in.

const envelope = { $ref: '#/components/schemas/StandardEnvelope' };
const json = { 'application/json': { schema: envelope } };
const response = (description: string) => ({ description, content: json });

function internalPaths(path: string, method: 'get' | 'post', operation: Record<string, unknown>): Array<[string, unknown]> {
  return [path, `/api${path}`].map((p) => [
    p,
    {
      [method]: {
        ...operation,
        operationId: p.startsWith('/api') ? `${operation.operationId as string}_api_alias` : operation.operationId,
      },
    },
  ]);
}

const WS = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

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
          'Guarded by X-Internal-Api-Key. Plans due jobs (idempotent), takes back jobs whose worker died, then runs up to max_jobs ready jobs. Optional body {max_jobs: 1 to 100, default 25}. Call about once a minute; safe to call repeatedly.',
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
          '401': response('Missing or invalid X-Internal-Api-Key header'),
          '422': response('Body failed validation'),
        },
      }),
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
