import 'server-only';

// OpenAPI entries of Squads (WP-M4-05, WP-M4-06, ADR-0043, ADR-0044). Kept in
// its own module like the Library's; `spec.ts` spreads these in.

type Json = Record<string, unknown>;

const ROOT = '/api/v1/workspaces/{workspace_id}';

const workspaceParam = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const squadParam = { name: 'squad_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const sessionParam = { name: 'session_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const slugParam = { name: 'slug', in: 'path', required: true, schema: { type: 'string', enum: ['launch', 'back_office', 'customer'] } };

function envelopeOf(schema: string | null, description: string): Json {
  return {
    description,
    content: {
      'application/json': {
        schema: schema
          ? {
              allOf: [
                { $ref: '#/components/schemas/StandardEnvelope' },
                { type: 'object', properties: { data: { $ref: `#/components/schemas/${schema}` } } },
              ],
            }
          : { $ref: '#/components/schemas/StandardEnvelope' },
      },
    },
  };
}

const STATUS_TEXT: Record<string, string> = {
  '401': 'Authentication required',
  '403': 'The role lacks the permission, the member may not edit this squad, or they need an admin for access (Ask an admin)',
  '404': 'Workspace or resource not found, including another workspace (never 403)',
  '422': 'Validation failed (code in errors[0].code, for example squad_members_count, squad_member_unavailable, squad_archived, mention_not_in_squad)',
  '502': 'sineva-ai answered badly while the specialist roster was read. Never an invented roster',
  '503': 'sineva-ai is unreachable while the specialist roster was read',
};

interface OperationInput {
  summary: string;
  description?: string;
  operationId: string;
  permission: string;
  params?: Json[];
  query?: Json[];
  requestSchema?: Json;
  optionalBody?: boolean;
  success: { status: string; description: string; schema: string | null };
  also?: string[];
}

function operation(input: OperationInput): Json {
  const statuses = ['401', '403', '404', ...(input.requestSchema || input.query ? ['422'] : []), ...(input.also ?? [])];
  return {
    tags: ['Squads'],
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    operationId: input.operationId,
    'x-permission': input.permission,
    parameters: [workspaceParam, ...(input.params ?? []), ...(input.query ?? [])],
    ...(input.requestSchema
      ? { requestBody: { required: !input.optionalBody, content: { 'application/json': { schema: input.requestSchema } } } }
      : {}),
    responses: {
      [input.success.status]: envelopeOf(input.success.schema, input.success.description),
      ...Object.fromEntries([...new Set(statuses)].map((status) => [status, envelopeOf(null, STATUS_TEXT[status] ?? status)])),
    },
  };
}

const slug = { type: 'string', maxLength: 32, example: 'sinofinance' };

export function squadOpenApiPaths(): Record<string, Json> {
  const upstream = ['502', '503'];
  return {
    [`${ROOT}/squads`]: {
      get: operation({
        summary: 'List squads',
        description:
          'Each squad carries what is computed for the caller: `attention` (null when the roster could not be read), `my_access` and `can_edit`.',
        operationId: 'listSquads',
        permission: 'squad.read',
        query: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived'] } }],
        success: { status: '200', description: 'Squads of the workspace', schema: 'SquadList' },
      }),
      post: operation({
        summary: 'Create a squad',
        description:
          'Needs the `squads.enabled` and `squads.max` entitlements (ignored in open mode) and a readable specialist roster (502 or 503 otherwise).',
        operationId: 'createSquad',
        permission: 'squad.create',
        requestSchema: { $ref: '#/components/schemas/SquadCreateRequest' },
        success: { status: '201', description: 'The new squad', schema: 'Squad' },
        also: upstream,
      }),
    },
    [`${ROOT}/squads/{squad_id}`]: {
      get: operation({
        summary: 'Get a squad',
        operationId: 'getSquad',
        permission: 'squad.read',
        params: [squadParam],
        success: { status: '200', description: 'The squad', schema: 'Squad' },
      }),
      patch: operation({
        summary: 'Rename, change the goal or lead, archive or restore a squad',
        description: 'Only the creator of a squad may edit it as a Member. Archiving and restoring are Owner or Admin only. An archived squad is read-only.',
        operationId: 'updateSquad',
        permission: 'squad.edit',
        params: [squadParam],
        requestSchema: { $ref: '#/components/schemas/SquadUpdateRequest' },
        success: { status: '200', description: 'The updated squad', schema: 'Squad' },
      }),
      delete: operation({
        summary: 'Delete a squad and its chat sessions',
        operationId: 'deleteSquad',
        permission: 'squad.delete',
        params: [squadParam],
        success: { status: '200', description: 'Deleted: data is { id, deleted: true }', schema: null },
      }),
    },
    [`${ROOT}/squads/{squad_id}/members`]: {
      put: operation({
        summary: 'Replace the members of a squad',
        description: 'Two to five specialists, in the order given. Naming a new lead is required when the current lead is removed.',
        operationId: 'setSquadMembers',
        permission: 'squad.edit',
        params: [squadParam],
        requestSchema: { $ref: '#/components/schemas/SquadMembersRequest' },
        success: { status: '200', description: 'The updated squad', schema: 'Squad' },
        also: upstream,
      }),
    },
    [`${ROOT}/squads/{squad_id}/access`]: {
      put: operation({
        summary: 'Let one person open a squad although they cannot use every member',
        description: 'Owner and Admin only. Output of restricted specialists becomes visible to that person (FR-SQD-18).',
        operationId: 'setSquadAccess',
        permission: 'squad.access.override',
        params: [squadParam],
        requestSchema: { $ref: '#/components/schemas/SquadAccessRequest' },
        success: { status: '200', description: 'data is { user_id, granted }', schema: null },
      }),
    },
    [`${ROOT}/squad-templates`]: {
      get: operation({
        summary: 'List squad templates in the request language',
        description: 'Only specialists that exist today appear as members; unreleased ones are never listed.',
        operationId: 'listSquadTemplates',
        permission: 'squad.read',
        success: { status: '200', description: 'Templates', schema: 'SquadTemplateList' },
      }),
    },
    [`${ROOT}/squad-templates/{slug}/use`]: {
      post: operation({
        summary: 'Create a squad from a template',
        description: 'Same checks as a hand-made squad. The body is optional and may override the name and goal.',
        operationId: 'useSquadTemplate',
        permission: 'squad.create',
        params: [slugParam],
        requestSchema: { $ref: '#/components/schemas/SquadTemplateUseRequest' },
        optionalBody: true,
        success: { status: '201', description: 'The new squad', schema: 'Squad' },
        also: upstream,
      }),
    },
    [`${ROOT}/squads/{squad_id}/sessions`]: {
      get: operation({
        summary: 'List your chat sessions of a squad',
        description: 'Sessions are private to their creator.',
        operationId: 'listSquadSessions',
        permission: 'squad.read',
        params: [squadParam],
        success: { status: '200', description: 'Your sessions', schema: null },
      }),
      post: operation({
        summary: 'Start a chat session with a squad',
        description: '403 when the person cannot use every member and has no override. 422 `squad_archived` or `squad_needs_attention` when the squad cannot take a turn.',
        operationId: 'createSquadSession',
        permission: 'squad.chat',
        params: [squadParam],
        requestSchema: { $ref: '#/components/schemas/SquadSessionCreateRequest' },
        optionalBody: true,
        success: { status: '201', description: 'The session (a conversation of kind squad)', schema: null },
      }),
    },
    [`${ROOT}/squads/{squad_id}/sessions/{session_id}`]: {
      get: operation({
        summary: 'Read a session: messages and the turns with their handoffs',
        description: 'Handoffs are stored, so handoff cards remain after completion and reload.',
        operationId: 'getSquadSession',
        permission: 'squad.read',
        params: [squadParam, sessionParam],
        success: { status: '200', description: 'Messages and turns', schema: 'SquadSessionDetail' },
      }),
    },
    [`${ROOT}/squads/{squad_id}/sessions/{session_id}/messages`]: {
      post: operation({
        summary: 'Send a message to a squad',
        description:
          'Stores the message and returns a run handle; attach to `GET /runs/{run_id}/events` for the reply (the shared run stream, which also carries `handoff`, `handoff_result` and `turn_limit`). A leading @member goes straight to that member and returns `ceiling_points: null`; a leading @specialist outside the squad is 422 `mention_not_in_squad`.',
        operationId: 'sendSquadMessage',
        permission: 'squad.chat',
        params: [squadParam, sessionParam],
        requestSchema: { $ref: '#/components/schemas/SquadMessageRequest' },
        success: { status: '201', description: 'Run handle and the points ceiling', schema: 'SquadMessageResult' },
      }),
    },
    [`${ROOT}/squads/{squad_id}/activity`]: {
      get: operation({
        summary: 'Squad turns with the per-member split of points',
        description: 'A person sees their own turns; Owner and Admin see every turn. No message text.',
        operationId: 'listSquadActivity',
        permission: 'squad.read',
        params: [squadParam],
        query: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } }],
        success: { status: '200', description: 'Turns', schema: 'SquadActivityList' },
      }),
    },
  };
}

const uuid = { type: 'string', format: 'uuid' };
const lead = {
  lead_type: { type: 'string', enum: ['sino', 'member'] },
  lead_agent_slug: { type: ['string', 'null'] },
};

export const SQUAD_COMPONENT_SCHEMAS: Record<string, Json> = {
  Squad: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      goal: { type: 'string', maxLength: 500 },
      ...lead,
      template_slug: { type: ['string', 'null'] },
      status: { type: 'string', enum: ['active', 'archived'] },
      members: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: { type: 'object', properties: { agent_slug: { type: 'string' }, position: { type: 'integer' } } },
      },
      attention: {
        type: ['array', 'null'],
        description: 'What stops the squad from taking turns. Null when the roster could not be read.',
        items: {
          type: 'object',
          properties: {
            reason: { type: 'string', enum: ['member_disabled', 'lead_removed', 'connection_missing'] },
            agent_slug: { type: ['string', 'null'] },
          },
        },
      },
      my_access: { type: 'string', enum: ['open', 'ask_admin'] },
      can_edit: { type: 'boolean' },
      ceiling_points: { type: 'integer', description: 'The "Up to N points" of a lead-routed turn' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  SquadList: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Squad' } } } },
  SquadCreateRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'goal', 'member_slugs'],
    properties: {
      name: { type: 'string', maxLength: 60 },
      goal: { type: 'string', maxLength: 500 },
      member_slugs: { type: 'array', items: slug, description: 'Two to five released specialists the caller may use' },
      ...lead,
      template_slug: { type: ['string', 'null'] },
    },
  },
  SquadUpdateRequest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 60 },
      goal: { type: 'string', maxLength: 500 },
      ...lead,
      status: { type: 'string', enum: ['active', 'archived'] },
    },
  },
  SquadMembersRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['member_slugs'],
    properties: { member_slugs: { type: 'array', items: slug }, ...lead },
  },
  SquadAccessRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['user_id', 'granted'],
    properties: { user_id: uuid, granted: { type: 'boolean' } },
  },
  SquadTemplateUseRequest: {
    type: 'object',
    additionalProperties: false,
    properties: { name: { type: 'string', maxLength: 60 }, goal: { type: 'string', maxLength: 500 } },
  },
  SquadTemplate: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      name: { type: 'string' },
      goal: { type: 'string' },
      member_slugs: { type: 'array', items: { type: 'string' } },
      lead_type: { type: 'string', enum: ['sino', 'member'] },
      starter_prompts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
      library_folders: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    },
  },
  SquadTemplateList: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/SquadTemplate' } } } },
  SquadSessionCreateRequest: {
    type: 'object',
    additionalProperties: false,
    properties: { title: { type: ['string', 'null'], maxLength: 120 } },
  },
  SquadMessageRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['content'],
    properties: { content: { type: 'string', maxLength: 8000 }, client_message_id: { type: ['string', 'null'], maxLength: 255 } },
  },
  SquadMessageResult: {
    type: 'object',
    properties: {
      message_id: uuid,
      run_id: { type: 'string', example: 'run_0a1b2c3d-0000-4000-8000-000000000001' },
      conversation_id: uuid,
      status: { type: 'string' },
      ceiling_points: { type: ['integer', 'null'], description: 'Null for a direct @SinoX: no pre-estimate' },
    },
  },
  SquadHandoff: {
    type: 'object',
    properties: {
      delegation_id: { type: 'string' },
      position: { type: 'integer' },
      from_slug: { type: 'string' },
      to_slug: { type: 'string' },
      task_summary: { type: 'string' },
      parallel_group: { type: ['integer', 'null'] },
      status: { type: 'string', enum: ['working', 'done', 'needs_review', 'failed'] },
      summary: { type: ['string', 'null'] },
      error_code: { type: ['string', 'null'] },
      points: { type: ['integer', 'null'] },
    },
  },
  SquadTurn: {
    type: 'object',
    properties: {
      run_handle: { type: 'string' },
      lead_slug: { type: 'string' },
      direct_slug: { type: ['string', 'null'] },
      ceiling_points: { type: ['integer', 'null'] },
      status: { type: 'string', enum: ['running', 'completed', 'failed', 'cancelled'] },
      termination_reason: {
        type: ['string', 'null'],
        enum: ['done', 'cap_delegations', 'cap_tokens', 'cap_time', 'cap_credits', 'error', 'cancelled', null],
      },
      delegation_count: { type: 'integer' },
      points: { type: ['integer', 'null'] },
      created_at: { type: 'string', format: 'date-time' },
      finished_at: { type: ['string', 'null'], format: 'date-time' },
      handoffs: { type: 'array', items: { $ref: '#/components/schemas/SquadHandoff' } },
    },
  },
  SquadActivityList: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/SquadTurn' } } } },
  SquadSessionDetail: {
    type: 'object',
    properties: {
      conversation: { type: 'object', description: 'A conversation of kind squad with squad_id' },
      messages: { type: 'array', items: { type: 'object' } },
      next_cursor: { type: ['string', 'null'] },
      turns: { type: 'array', items: { $ref: '#/components/schemas/SquadTurn' } },
    },
  },
};
