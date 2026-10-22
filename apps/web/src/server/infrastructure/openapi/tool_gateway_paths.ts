import 'server-only';
const response = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } } },
});
export function getToolGatewayPaths() {
  const context = {
    in: 'header',
    name: 'X-Sineva-Context',
    required: true,
    schema: { type: 'string' },
    description:
      'Original platform signature bound to workspace, user, specialist, run, allowed_tools, skill_tools and trifecta flags. No implicit tool scopes.',
  };
  const responses = {
    '200': response('Gateway outcome or metadata, without credentials'),
    '401': response('Missing internal key or invalid signed context'),
    '403': response('Action, scope, kill switch or egress denied'),
    '404': response('No visible granted connection'),
    '409': response('Reconnect, ambiguous connection, approval or idempotency conflict'),
    '422': response('Invalid request or tool arguments'),
    '429': {
      ...response('Rate limited'),
      headers: { 'Retry-After': { schema: { type: 'integer', example: 60 } } },
    },
    '500': response('Unexpected platform failure'),
    '502': response('Provider refusal or invalid data'),
    '503': response('Dependency unavailable or uncertain write outcome'),
  };
  const execute = {
    tags: ['Internal'],
    summary: 'Execute a connection tool through platform policy',
    security: [{ InternalApiKey: [] }],
    parameters: [context],
    description:
      'Live writes require an idempotency key and create a human approval. Simulated writes perform no external call. Gmail is the implemented executor. The cron bearer is refused. The returned approval_id is the runtime correlation ID, not the Inbox decision row ID.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['tool_name', 'arguments', 'run_id', 'call_id'],
            properties: {
              tool_name: { type: 'string', maxLength: 128, pattern: '^[a-z][a-z0-9_]*$' },
              arguments: {
                type: 'object',
                additionalProperties: true,
                description: 'Action-schema validated, at most 64 KiB',
              },
              run_id: { type: 'string', pattern: '^run_[0-9a-f-]{36}$' },
              call_id: { type: 'string', minLength: 1, maxLength: 128 },
              idempotency_key: { type: 'string', minLength: 1, maxLength: 200 },
              mode: { type: 'string', enum: ['live', 'simulate'], default: 'live' },
            },
          },
        },
      },
    },
    responses,
  };
  const resolve = {
    tags: ['Internal'],
    summary: 'Resolve metadata of connections granted to the signed specialist',
    security: [{ InternalApiKey: [] }],
    parameters: [
      context,
      {
        in: 'query',
        name: 'run_id',
        required: true,
        schema: { type: 'string', pattern: '^run_[0-9a-f-]{36}$' },
      },
      {
        in: 'query',
        name: 'provider_id',
        required: true,
        schema: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
      },
    ],
    description:
      'Connection IDs, provider IDs, status, access level and scope strings only. No account labels or secrets.',
    responses,
  };
  return Object.fromEntries(
    ['', '/api'].flatMap((prefix) => [
      [
        `${prefix}/internal/v1/tool-gateway/execute`,
        { post: { ...execute, operationId: `${prefix ? 'api_' : ''}execute_connection_tool` } },
      ],
      [
        `${prefix}/internal/v1/connections/resolve`,
        { get: { ...resolve, operationId: `${prefix ? 'api_' : ''}resolve_tool_connections` } },
      ],
    ]),
  );
}
