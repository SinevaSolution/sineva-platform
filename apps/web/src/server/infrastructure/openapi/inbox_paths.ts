import 'server-only';

// OpenAPI paths of the Inbox, approvals and input requests (WP-M1-40, ADR-0032).
// Kept beside the main spec so the family reads in one place; `spec.ts` spreads it in.

const envelope = { $ref: '#/components/schemas/StandardEnvelope' };
const json = { 'application/json': { schema: envelope } };
const response = (description: string) => ({ description, content: json });

const WS = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const ITEM = { name: 'item_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const APPROVAL = { name: 'approval_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const COMMON_ERRORS = {
  '401': response('Not signed in'),
  '403': response('Role lacks the permission, or a non-session bearer token (wrong_token_audience)'),
  '404': response('Not found, not visible to this role, or another workspace'),
};

// Statuses of the calls that tell sineva-ai the outcome. 409 carries `already_decided`
// (details name the decider), `version_conflict`, `awaiting_revision` or `not_dismissable`.
const RESUMING_ERRORS = {
  ...COMMON_ERRORS,
  '409': response('already_decided, version_conflict, awaiting_revision or not_dismissable'),
  '422': response('Body failed validation, or an edit/answer does not fit the item'),
  '502': response('sineva-ai answered badly to the resume; nothing changed and the item stays pending'),
  '503': response('sineva-ai could not be reached (run_resume_unavailable); nothing changed and the item stays pending'),
};

const ITEM_VIEW_NOTE =
  'Returns an InboxItemView (src/shared/inbox_view.ts). A viewer receives summaries only: no draft payload, revision bodies, answers or notes.';

const internalErrors = {
  '401': response('Missing or invalid X-Internal-Api-Key header'),
  '404': response('The run is not a run of this workspace'),
  '422': response('Body failed validation (the schema is strict: a user_id key is refused)'),
};

function internalPaths(
  path: string,
  post: Record<string, unknown>,
  // A scheduler that can only issue GET (Vercel Cron) triggers the same job.
  options: { alsoGet?: boolean } = {},
): Array<[string, unknown]> {
  return [path, `/api${path}`].map((p) => {
    const operationId = (suffix: string) =>
      p.startsWith('/api') ? `${post.operationId as string}${suffix}_api_alias` : `${post.operationId as string}${suffix}`;
    return [
      p,
      {
        post: { ...post, operationId: operationId('') },
        ...(options.alsoGet ? { get: { ...post, operationId: operationId('_get') } } : {}),
      },
    ];
  });
}

export function getInboxPaths(): Record<string, unknown> {
  const base = '/api/v1/workspaces/{workspace_id}';
  return {
    [`${base}/inbox`]: {
      get: {
        tags: ['Inbox'],
        summary: 'List Inbox items',
        description: `Filter by tab (needs_review, needs_input, needs_you, updates, done), agent_slug, kind, source_type, q (part of the title, 80 characters at most) and cursor. needs_you is needs_review and needs_input together; results are in updates, not done. Owner and admin see every item, a member sees items addressed to them, a viewer sees Updates and Done summaries only. ${ITEM_VIEW_NOTE}`,
        operationId: 'list_inbox',
        parameters: [
          WS,
          { name: 'tab', in: 'query', schema: { type: 'string', enum: ['needs_review', 'needs_input', 'needs_you', 'updates', 'done'] } },
          { name: 'agent_slug', in: 'query', schema: { type: 'string' } },
          { name: 'kind', in: 'query', schema: { type: 'string', enum: ['approval', 'input_request', 'result'] } },
          { name: 'source_type', in: 'query', schema: { type: 'string', enum: ['chat', 'room', 'system'] } },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: { '200': response('Items and next_cursor'), ...COMMON_ERRORS, '422': response('Invalid query (the ideas tab is not available)') },
      },
    },
    [`${base}/inbox/counts`]: {
      get: {
        tags: ['Inbox'],
        summary: 'Inbox counts and the rail badge',
        description: 'needs_review, needs_input, updates, done, unread counts and badge (needs_review + needs_input). Poll every 30 seconds and on tab focus. Costs no points.',
        operationId: 'get_inbox_counts',
        parameters: [WS],
        responses: { '200': response('Counts'), ...COMMON_ERRORS },
      },
    },
    [`${base}/inbox/{item_id}`]: {
      get: {
        tags: ['Inbox'],
        summary: 'Inbox item detail',
        description: `${ITEM_VIEW_NOTE} The detail adds the payload, editable fields, the approve note key and the revisions.`,
        operationId: 'get_inbox_item',
        parameters: [WS, ITEM],
        responses: { '200': response('Item detail'), ...COMMON_ERRORS },
      },
    },
    [`${base}/inbox/{item_id}/read`]: {
      post: {
        tags: ['Inbox'],
        summary: 'Mark an item read for the caller',
        operationId: 'mark_inbox_item_read',
        parameters: [WS, ITEM],
        responses: { '200': response('Marked'), ...COMMON_ERRORS },
      },
    },
    [`${base}/inbox/{item_id}/dismiss`]: {
      post: {
        tags: ['Inbox'],
        summary: 'Dismiss an open input request',
        description: 'Tells the run the question went unanswered. Approvals cannot be dismissed (409 not_dismissable). Session only.',
        operationId: 'dismiss_inbox_item',
        parameters: [WS, ITEM],
        responses: { '200': response('Dismissed'), ...RESUMING_ERRORS },
      },
    },
    [`${base}/inbox/{item_id}/answer`]: {
      post: {
        tags: ['Inbox'],
        summary: 'Answer an input request',
        description: 'Validated against the form the specialist asked for, then sent to the paused run. Session only.',
        operationId: 'answer_inbox_item',
        parameters: [WS, ITEM],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['version', 'answers'],
                properties: {
                  version: { type: 'integer', minimum: 1 },
                  answers: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: { '200': response('Answered'), ...RESUMING_ERRORS },
      },
    },
    [`${base}/approvals/{approval_id}/decision`]: {
      post: {
        tags: ['Inbox'],
        summary: 'Approve or reject a draft',
        description:
          'First writer wins. `version` is the one the caller last saw. Approve may carry `edited_payload` (only fields the action type marks editable; re-hashed and revalidated). For draft.review, approve marks the draft ready and executes nothing. sineva-ai is told before the decision is committed. Session only.',
        operationId: 'decide_approval',
        parameters: [WS, APPROVAL],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['decision', 'version'],
                properties: {
                  decision: { type: 'string', enum: ['approve', 'reject'] },
                  version: { type: 'integer', minimum: 1 },
                  note: { type: 'string', maxLength: 1000 },
                  edited_payload: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: { '200': response('Decision recorded'), ...RESUMING_ERRORS },
      },
    },
    [`${base}/approvals/{approval_id}/changes`]: {
      post: {
        tags: ['Inbox'],
        summary: 'Ask the specialist for changes',
        description: 'The approval stays pending and awaits a new revision; the old revision stays visible. Session only.',
        operationId: 'request_approval_changes',
        parameters: [WS, APPROVAL],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['version', 'instruction'],
                properties: {
                  version: { type: 'integer', minimum: 1 },
                  instruction: { type: 'string', minLength: 1, maxLength: 1000 },
                },
              },
            },
          },
        },
        responses: { '200': response('Change request sent'), ...RESUMING_ERRORS },
      },
    },
    ...Object.fromEntries([
      ...internalPaths('/internal/v1/approvals', {
        tags: ['Internal'],
        summary: 'Create an approval item (sineva-ai to platform)',
        description:
          'Guarded by X-Internal-Api-Key. Idempotent on approval_id (and revision): a replay returns 200 with the same ids. The recipient and sineva-ai run id come from the platform run handle, never from the body. Proposed contract, pending sineva-ai: see approval_*.json fixtures.',
        operationId: 'create_approval_item',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['workspace_id', 'run_id', 'approval_id', 'action_kind', 'tool_name', 'draft_summary', 'payload'],
                properties: {
                  workspace_id: { type: 'string', format: 'uuid' },
                  run_id: { type: 'string', description: 'Platform run handle (run_<uuid>)' },
                  approval_id: { type: 'string', format: 'uuid' },
                  revision: { type: 'integer', minimum: 1, default: 1 },
                  action_kind: { type: 'string', example: 'draft.review' },
                  tool_name: { type: 'string' },
                  agent_slug: { type: 'string' },
                  draft_summary: { type: 'string', maxLength: 200 },
                  payload: { type: 'object', additionalProperties: true },
                  expires_at: { type: 'string', format: 'date-time', nullable: true },
                  guardrail_reason: { type: 'string', nullable: true },
                  card_id: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': response('Already recorded'), '201': response('Recorded'), ...internalErrors, '409': response('Revision out of order') },
      }),
      ...internalPaths('/internal/v1/input-requests', {
        tags: ['Internal'],
        summary: 'Create an input request item (sineva-ai to platform)',
        description: 'Guarded by X-Internal-Api-Key. Idempotent on input_request_id. A form has at most 8 fields.',
        operationId: 'create_input_request_item',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['workspace_id', 'run_id', 'input_request_id', 'question', 'fields'],
                properties: {
                  workspace_id: { type: 'string', format: 'uuid' },
                  run_id: { type: 'string' },
                  input_request_id: { type: 'string', format: 'uuid' },
                  agent_slug: { type: 'string' },
                  question: { type: 'string', maxLength: 500 },
                  fields: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: true } },
                  expires_at: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
        },
        responses: { '200': response('Already recorded'), '201': response('Recorded'), ...internalErrors },
      }),
      ...internalPaths('/internal/v1/inbox/expire', {
        tags: ['Internal'],
        summary: 'Run the Inbox expiry job',
        description:
          'Guarded by X-Internal-Api-Key or by Authorization: Bearer CRON_SECRET (the form Vercel Cron sends; GET exists because Vercel Cron only issues GET). Expires due approvals and input requests (never approves), resumes the runs with "expired", retries failed resumes, releases stale claims and reports approvals within 24 hours of expiry. Safe to call repeatedly.',
        operationId: 'run_inbox_expiry',
        responses: { '200': response('Job result counts'), '401': response('Missing or invalid X-Internal-Api-Key header or cron bearer token') },
      }, { alsoGet: true }),
    ]),
  };
}
