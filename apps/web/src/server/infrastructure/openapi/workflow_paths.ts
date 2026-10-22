import 'server-only';

// OpenAPI entries of Workflows (WP-M3-08, WP-M3-02 platform side; ADR-0045 and
// ADR-0046). Kept in its own module so the large main spec stays readable;
// `spec.ts` spreads these in.

type Json = Record<string, unknown>;

const WORKSPACE = '/api/v1/workspaces/{workspace_id}';

const workspaceParam = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const workflowParam = { name: 'workflow_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const runParam = { name: 'run_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

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
  '403': 'The role lacks the permission',
  '404': 'Workspace or resource not found, including another workspace (never 403)',
  '409': 'Conflict with the current state (code in errors[0].code)',
  '422': 'Validation failed (code in errors[0].code; workflow_invalid lists the issue codes)',
  '502': 'sineva-ai answered badly. Never a fabricated result',
  '503': 'sineva-ai is unreachable (workflow_engine_unavailable: nothing ran)',
};

interface OperationInput {
  summary: string;
  description?: string;
  operationId: string;
  permission: string;
  params?: Json[];
  query?: Json[];
  requestSchema?: Json;
  success: { status: string; description: string; schema: string | null };
  also?: string[];
}

function operation(input: OperationInput): Json {
  const statuses = ['401', '403', '404', ...(input.requestSchema || input.query ? ['422'] : []), ...(input.also ?? [])];
  return {
    tags: ['Workflows'],
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    operationId: input.operationId,
    'x-permission': input.permission,
    parameters: [workspaceParam, ...(input.params ?? []), ...(input.query ?? [])],
    ...(input.requestSchema
      ? { requestBody: { required: true, content: { 'application/json': { schema: input.requestSchema } } } }
      : {}),
    responses: {
      [input.success.status]: envelopeOf(input.success.schema, input.success.description),
      ...Object.fromEntries([...new Set(statuses)].map((status) => [status, envelopeOf(null, STATUS_TEXT[status] ?? status)])),
    },
  };
}

const queryParam = (name: string, schema: Json, description?: string): Json => ({
  name,
  in: 'query',
  required: false,
  schema,
  ...(description ? { description } : {}),
});

const pageQuery = [
  queryParam('page', { type: 'integer', minimum: 1, default: 1 }),
  queryParam('per_page', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
];

export function workflowOpenApiPaths(): Record<string, Json> {
  return {
    [`${WORKSPACE}/workflows`]: {
      get: operation({
        summary: 'List Workflows',
        description:
          'Newest change first. Archived ones are left out unless status=archived. status=needs_attention is computed from live facts (a specialist that is off, an app that is not connected) and is empty when sineva-ai cannot be asked.',
        operationId: 'list_workflows',
        permission: 'workflow.read',
        query: [
          queryParam('q', { type: 'string', maxLength: 80 }),
          queryParam('status', { type: 'string', enum: ['draft', 'published', 'archived', 'needs_attention'] }),
          ...pageQuery,
        ],
        success: { status: '200', description: 'Page of Workflows', schema: 'WorkflowList' },
      }),
      post: operation({
        summary: 'Create a blank Workflow draft',
        description: 'Checks the plan limit (workflows.max). The definition may be half finished: only publish and run judge it.',
        operationId: 'create_workflow',
        permission: 'workflow.create',
        requestSchema: { $ref: '#/components/schemas/WorkflowCreateRequest' },
        success: { status: '201', description: 'The new draft', schema: 'Workflow' },
        also: ['403'],
      }),
    },
    [`${WORKSPACE}/workflows/{workflow_id}`]: {
      get: operation({
        summary: 'Get a Workflow with its draft definition, issues and test state',
        operationId: 'get_workflow',
        permission: 'workflow.read',
        params: [workflowParam],
        success: { status: '200', description: 'The Workflow', schema: 'WorkflowDetail' },
      }),
      patch: operation({
        summary: 'Save the draft',
        description:
          'Compare and set on `expected_revision`: 409 draft_conflict when someone saved first. A definition change moves the revision and so un-tests the draft; a rename does not. A Member edits only drafts they created.',
        operationId: 'update_workflow_draft',
        permission: 'workflow.edit',
        params: [workflowParam],
        requestSchema: { $ref: '#/components/schemas/WorkflowUpdateRequest' },
        success: { status: '200', description: 'Saved: id, name, description, draft_revision, updated_at', schema: null },
        also: ['409'],
      }),
      delete: operation({
        summary: 'Delete a Workflow that has no runs',
        description: '409 workflow_has_runs when it has runs: archive it instead.',
        operationId: 'delete_workflow',
        permission: 'workflow.delete',
        params: [workflowParam],
        success: { status: '200', description: 'Deleted: { id, deleted: true }', schema: null },
        also: ['409'],
      }),
    },
    [`${WORKSPACE}/workflows/{workflow_id}/versions`]: {
      get: operation({
        summary: 'List published versions, newest first',
        operationId: 'list_workflow_versions',
        permission: 'workflow.read',
        params: [workflowParam],
        success: { status: '200', description: 'Versions', schema: 'WorkflowVersionList' },
      }),
    },
    [`${WORKSPACE}/workflows/{workflow_id}/publish`]: {
      post: operation({
        summary: 'Publish the draft as a new immutable version',
        description:
          'Needs a draft with no issues and one test run that succeeded on this exact draft revision. 422 workflow_invalid lists the issue codes (limits, references, the review-before-send lint, needs attention); 409 test_run_required, draft_conflict or workflow_archived; 503 when sineva-ai cannot say which specialists are on. Send `{}` for no note.',
        operationId: 'publish_workflow',
        permission: 'workflow.publish',
        params: [workflowParam],
        requestSchema: { $ref: '#/components/schemas/WorkflowPublishRequest' },
        success: { status: '201', description: 'The Workflow and its new version', schema: 'WorkflowPublished' },
        also: ['409', '503'],
      }),
    },
    [`${WORKSPACE}/workflows/{workflow_id}/archive`]: {
      post: operation({
        summary: 'Archive a Workflow',
        description: 'Keeps versions and runs, stops new runs and edits.',
        operationId: 'archive_workflow',
        permission: 'workflow.delete',
        params: [workflowParam],
        success: { status: '200', description: 'The archived Workflow', schema: 'Workflow' },
      }),
    },
    [`${WORKSPACE}/workflows/{workflow_id}/restore/{version_id}`]: {
      post: operation({
        summary: 'Restore an old version',
        description: 'Republishes that definition as a new number and makes it the draft. Skips the test gate, not the validation.',
        operationId: 'restore_workflow_version',
        permission: 'workflow.publish',
        params: [
          workflowParam,
          { name: 'version_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestSchema: { $ref: '#/components/schemas/WorkflowPublishRequest' },
        success: { status: '201', description: 'The Workflow and its new version', schema: 'WorkflowPublished' },
        also: ['409', '503'],
      }),
    },
    [`${WORKSPACE}/workflows/{workflow_id}/runs`]: {
      post: operation({
        summary: 'Start a test run of the draft or a live run of the published version',
        description:
          'Validates the definition and the inputs, then asks sineva-ai to start (proposed contract, ADR-0046). 503 workflow_engine_unavailable means nothing ran and no run exists; 502 keeps a failed run. 409 not_published for a live run before the first publish.',
        operationId: 'start_workflow_run',
        permission: 'workflow.run',
        params: [workflowParam],
        requestSchema: { $ref: '#/components/schemas/WorkflowRunStartRequest' },
        success: { status: '201', description: 'The run', schema: 'WorkflowRun' },
        also: ['409', '502', '503'],
      }),
    },
    [`${WORKSPACE}/workflow-templates`]: {
      get: operation({
        summary: 'List the released Workflow templates',
        description: 'Localized names and what is missing here (specialists that are off, apps not connected). Later waves are hidden.',
        operationId: 'list_workflow_templates',
        permission: 'workflow.read',
        query: [queryParam('locale', { type: 'string', enum: ['en', 'id'], default: 'en' })],
        success: { status: '200', description: 'Templates', schema: 'WorkflowTemplateList' },
      }),
    },
    [`${WORKSPACE}/workflow-templates/{slug}/use`]: {
      post: operation({
        summary: 'Make an editable draft from a template',
        description: 'Always a draft, never published. A missing specialist or app does not block the copy.',
        operationId: 'use_workflow_template',
        permission: 'workflow.create',
        params: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        requestSchema: { $ref: '#/components/schemas/WorkflowTemplateUseRequest' },
        success: { status: '201', description: 'The new draft', schema: 'Workflow' },
      }),
    },
    [`${WORKSPACE}/workflow-catalog`]: {
      get: operation({
        summary: 'What the builder can pick: specialists that are on, connected apps and their actions',
        description:
          'enabled_specialists is null when sineva-ai cannot be asked. Connections and actions come from the connector registry; there is none on this deployment yet, so both are empty.',
        operationId: 'get_workflow_catalog',
        permission: 'workflow.read',
        success: { status: '200', description: 'The catalog', schema: 'WorkflowCatalog' },
      }),
    },
    [`${WORKSPACE}/workflow-runs`]: {
      get: operation({
        summary: 'Run history, global or for one Workflow',
        operationId: 'list_workflow_runs',
        permission: 'workflow.read',
        query: [
          queryParam('workflow_id', { type: 'string', format: 'uuid' }),
          queryParam('status', { type: 'string', enum: ['queued', 'running', 'waiting', 'needs_review', 'succeeded', 'failed', 'cancelled', 'budget_exceeded'] }),
          queryParam('mode', { type: 'string', enum: ['test', 'live'] }),
          ...pageQuery,
        ],
        success: { status: '200', description: 'Page of runs', schema: 'WorkflowRunList' },
      }),
    },
    [`${WORKSPACE}/workflow-runs/{run_id}`]: {
      get: operation({
        summary: 'A run with its step timeline',
        description:
          'An active run is read back from sineva-ai first; `engine_reachable: false` means the state shown is the last one it reported. Step output and trace are returned only with workflow.trace.view.',
        operationId: 'get_workflow_run',
        permission: 'workflow.read',
        params: [runParam],
        success: { status: '200', description: 'The run', schema: 'WorkflowRunDetail' },
      }),
    },
    [`${WORKSPACE}/workflow-runs/{run_id}/cancel`]: {
      post: operation({
        summary: 'Cancel an active run',
        description: 'The starter, an Admin or the Owner. The engine cancels first; 503 leaves the run as it is.',
        operationId: 'cancel_workflow_run',
        permission: 'workflow.run',
        params: [runParam],
        success: { status: '200', description: 'The cancelled run', schema: 'WorkflowRun' },
        also: ['409', '502', '503'],
      }),
    },
    [`${WORKSPACE}/workflow-runs/{run_id}/resume`]: {
      post: operation({
        summary: 'Resume a failed run from its failed step, or continue after the budget was reached',
        description: '`continue_after_budget` is the Owner only. 409 run_not_resumable when the mode does not fit the state.',
        operationId: 'resume_workflow_run',
        permission: 'workflow.run',
        params: [runParam],
        requestSchema: { $ref: '#/components/schemas/WorkflowRunResumeRequest' },
        success: { status: '202', description: 'The resumed run', schema: 'WorkflowRun' },
        also: ['409', '502', '503'],
      }),
    },
    '/api/internal/v1/workflow-runs/events': {
      post: {
        tags: ['Internal'],
        summary: 'Run progress reported by sineva-ai',
        description:
          'Guarded by X-Internal-Api-Key only. The tenant must own the run (404 otherwise). An event applies only with a higher sequence than the stored one; every event is stored. 200 acknowledges even a duplicate or a stale event. Proposed contract, pending sineva-ai: see the workflow_* fixtures (ADR-0046).',
        operationId: 'ingest_workflow_run_event',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WorkflowRunEvent' } } } },
        responses: {
          '200': envelopeOf(null, 'Acknowledged: data is { applied, duplicate }'),
          '401': envelopeOf(null, 'Missing or invalid X-Internal-Api-Key header'),
          '404': envelopeOf(null, 'No such run under that tenant'),
          '422': envelopeOf(null, 'Validation failed'),
        },
      },
    },
  };
}

const uuid = { type: 'string', format: 'uuid' };
const nullableString = { type: ['string', 'null'] };
const dateTime = { type: 'string', format: 'date-time' };
const nullableDateTime = { type: ['string', 'null'], format: 'date-time' };
const runStatus = {
  type: 'string',
  enum: ['queued', 'running', 'waiting', 'needs_review', 'succeeded', 'failed', 'cancelled', 'budget_exceeded'],
};
const stepStatus = { type: 'string', enum: ['waiting', 'running', 'needs_review', 'done', 'failed', 'skipped'] };

const issue = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'Message key suffix under workflows.issues' },
    path: { type: 'string', example: 'steps[2].instruction' },
    step_key: nullableString,
    params: { type: 'object', additionalProperties: true },
    needs_attention: { type: 'boolean' },
  },
};

const definition = {
  type: 'object',
  description: 'Workflow definition, schema_version 1 (ADR-0045). Validated by the shared validator at publish and run.',
  required: ['schema_version', 'inputs', 'steps', 'outputs', 'limits'],
  properties: {
    schema_version: { type: 'integer', example: 1 },
    inputs: { type: 'array', items: { type: 'object' }, maxItems: 30 },
    steps: { type: 'array', items: { type: 'object' }, maxItems: 40 },
    outputs: { type: 'array', items: { type: 'object' }, maxItems: 20 },
    limits: { type: 'object' },
  },
};

export const WORKFLOW_COMPONENT_SCHEMAS: Record<string, Json> = {
  Workflow: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      description: nullableString,
      status: { type: 'string', enum: ['draft', 'published', 'archived'] },
      needs_attention: { type: ['boolean', 'null'], description: 'Null when sineva-ai could not be asked' },
      attention: { type: 'array', items: issue },
      version: { type: ['integer', 'null'] },
      template_slug: nullableString,
      created_by: uuid,
      step_count: { type: 'integer' },
      specialists: { type: 'array', items: { type: 'string' } },
      draft_revision: { type: 'integer' },
      last_run: {
        type: ['object', 'null'],
        properties: { id: uuid, status: runStatus, mode: { type: 'string', enum: ['test', 'live'] }, started_at: nullableDateTime, finished_at: nullableDateTime },
      },
      created_at: dateTime,
      updated_at: dateTime,
    },
  },
  WorkflowDetail: {
    allOf: [
      { $ref: '#/components/schemas/Workflow' },
      {
        type: 'object',
        properties: {
          definition,
          issues: { type: 'array', items: issue },
          tested_current_draft: { type: 'boolean', description: 'A test run succeeded on exactly this draft revision' },
          catalog_known: { type: 'boolean' },
        },
      },
    ],
  },
  WorkflowList: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/Workflow' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      per_page: { type: 'integer' },
    },
  },
  WorkflowVersion: {
    type: 'object',
    properties: {
      id: uuid,
      version_number: { type: 'integer' },
      note: nullableString,
      restored_from: { type: ['integer', 'null'] },
      published_by: uuid,
      published_at: dateTime,
      step_count: { type: 'integer' },
    },
  },
  WorkflowVersionList: {
    type: 'object',
    properties: { items: { type: 'array', items: { $ref: '#/components/schemas/WorkflowVersion' } } },
  },
  WorkflowPublished: {
    type: 'object',
    properties: {
      workflow: { $ref: '#/components/schemas/Workflow' },
      version: { $ref: '#/components/schemas/WorkflowVersion' },
    },
  },
  WorkflowCreateRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: ['string', 'null'], maxLength: 500 },
      definition,
    },
  },
  WorkflowUpdateRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['expected_revision'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: { type: ['string', 'null'], maxLength: 500 },
      definition,
      expected_revision: { type: 'integer', minimum: 1 },
    },
  },
  WorkflowPublishRequest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      note: { type: ['string', 'null'], maxLength: 280 },
      expected_revision: { type: 'integer', minimum: 1 },
    },
  },
  WorkflowTemplate: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      name: { type: 'string' },
      summary: { type: 'string' },
      guardrail: { type: 'string' },
      specialists: { type: 'array', items: { type: 'string' } },
      missing_specialists: { type: 'array', items: { type: 'string' } },
      requirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: { provider: { type: 'string' }, label: { type: 'string' }, optional: { type: 'boolean' }, connected: { type: 'boolean' } },
        },
      },
      step_count: { type: 'integer' },
      review_count: { type: 'integer' },
    },
  },
  WorkflowTemplateList: {
    type: 'object',
    properties: { items: { type: 'array', items: { $ref: '#/components/schemas/WorkflowTemplate' } } },
  },
  WorkflowTemplateUseRequest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      locale: { type: 'string', enum: ['en', 'id'], default: 'en' },
      name: { type: 'string', minLength: 1, maxLength: 120 },
    },
  },
  WorkflowCatalog: {
    type: 'object',
    properties: {
      enabled_specialists: { type: ['array', 'null'], items: { type: 'string' } },
      connections: {
        type: 'array',
        items: { type: 'object', properties: { id: uuid, provider: { type: 'string' }, label: { type: 'string' }, connected: { type: 'boolean' } } },
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { provider: { type: 'string' }, action_id: { type: 'string' }, class: { type: 'string', enum: ['read', 'write', 'send', 'pay'] } },
        },
      },
    },
  },
  WorkflowRunStartRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['test', 'live'] },
      inputs: { type: 'object', additionalProperties: true, description: 'Keyed by the definition input keys; defaults fill the rest' },
      locale: { type: 'string', enum: ['en', 'id'] },
    },
  },
  WorkflowRunResumeRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: { mode: { type: 'string', enum: ['from_failed_step', 'continue_after_budget'] } },
  },
  WorkflowRun: {
    type: 'object',
    properties: {
      id: uuid,
      workflow_id: uuid,
      workflow_name: { type: 'string' },
      mode: { type: 'string', enum: ['test', 'live'] },
      status: runStatus,
      started_by: uuid,
      trigger_type: { type: 'string', enum: ['manual', 'chat', 'routine', 'mcp'] },
      version_number: { type: ['integer', 'null'] },
      credits_estimated: { type: ['integer', 'null'] },
      credits_used: { type: 'integer' },
      error_code: nullableString,
      started_at: nullableDateTime,
      finished_at: nullableDateTime,
      created_at: dateTime,
    },
  },
  WorkflowRunList: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/WorkflowRun' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      per_page: { type: 'integer' },
    },
  },
  WorkflowRunDetail: {
    allOf: [
      { $ref: '#/components/schemas/WorkflowRun' },
      {
        type: 'object',
        properties: {
          plan: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, type: { type: 'string' }, title: { type: 'string' }, specialist: nullableString, parent_key: nullableString },
            },
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                step_key: { type: 'string' },
                status: stepStatus,
                attempt: { type: 'integer' },
                progress: { type: ['object', 'null'], properties: { current: { type: 'integer' }, total: { type: 'integer' } } },
                credits: { type: 'integer' },
                error_code: nullableString,
                approval_id: { type: ['string', 'null'], format: 'uuid' },
                started_at: nullableDateTime,
                finished_at: nullableDateTime,
                output_preview: { ...nullableString, description: 'Only with workflow.trace.view' },
                trace: { description: 'Only with workflow.trace.view' },
              },
            },
          },
          engine_reachable: { type: 'boolean' },
        },
      },
    ],
  },
  WorkflowRunEvent: {
    type: 'object',
    required: ['event_id', 'tenant_id', 'run_id', 'sequence', 'type', 'occurred_at', 'data'],
    properties: {
      event_id: { type: 'string' },
      tenant_id: uuid,
      run_id: { ...uuid, description: 'The engine run id the platform chose when it started the run' },
      sequence: { type: 'integer', minimum: 1 },
      type: { type: 'string', enum: ['run_status', 'step_started', 'step_completed'] },
      occurred_at: dateTime,
      data: { type: 'object', additionalProperties: true },
    },
  },
};
