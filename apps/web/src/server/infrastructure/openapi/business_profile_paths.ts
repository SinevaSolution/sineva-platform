import 'server-only';

const text = (maxLength: number) => ({ type: 'string', maxLength });
const uuid = { type: 'string', format: 'uuid' };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const profileFields = {
  display_name: nullable(text(100)),
  legal_name: nullable(text(150)),
  industry: nullable(text(80)),
  city: nullable(text(80)),
  province: nullable(text(80)),
  audience: nullable(text(500)),
  website_url: nullable({ type: 'string', format: 'uri', maxLength: 2048 }),
  languages: nullable({ type: 'array', maxItems: 5, items: { type: 'string' } }),
  goals: nullable({
    type: 'array',
    maxItems: 3,
    items: {
      type: 'string',
      enum: [
        'faster_replies',
        'organize_finances',
        'create_content',
        'find_customers',
        'manage_staff',
        'tax_admin',
        'understand_numbers',
      ],
    },
  }),
  social_handles: nullable(
    object({
      instagram: text(200),
      tiktok: text(200),
      facebook: text(200),
      x: text(200),
      marketplace_url: { type: 'string', format: 'uri' },
    }),
  ),
  business_hours: nullable(
    object({
      note: text(300),
      days: {
        type: 'array',
        maxItems: 14,
        items: object(
          {
            day: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
            opens: text(5),
            closes: text(5),
          },
          ['day', 'opens', 'closes'],
        ),
      },
    }),
  ),
  brand_voice: nullable(
    object({
      formality: { type: 'string', enum: ['formal', 'neutral', 'casual'] },
      second_person: { type: 'string', enum: ['anda', 'kamu', 'avoid'] },
      emoji_use: { type: 'string', enum: ['never', 'sometimes', 'often'] },
      words_to_use: { type: 'array', maxItems: 20, items: text(40) },
      words_to_avoid: { type: 'array', maxItems: 20, items: text(40) },
      samples: { type: 'array', maxItems: 3, items: text(500) },
    }),
  ),
};
const offering = {
  name: text(120),
  description: nullable(text(500)),
  price_amount: nullable({
    type: 'integer',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: 'Integer IDR entered by the owner; never inferred',
  }),
  url: nullable({ type: 'string', maxLength: 2048 }),
  source: { type: 'string', enum: ['user', 'scan'] },
  confirmed: { type: 'boolean' },
};
const policy = {
  kind: { type: 'string', enum: ['returns', 'shipping', 'payment', 'hours', 'faq', 'other'] },
  title: text(120),
  body: text(2000),
  source: { type: 'string', enum: ['user', 'scan'] },
  confirmed: { type: 'boolean' },
};
const provenance = {
  scan_id: uuid,
  field_sources: {
    type: 'object',
    additionalProperties: { type: 'string', enum: ['user', 'website'] },
  },
};
const envelope = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } } },
});

function operation(
  summary: string,
  path: string,
  status = 200,
  body?: Record<string, unknown>,
  upstream = false,
) {
  const parameters: Record<string, unknown>[] = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema:
      match[1] === 'version'
        ? { type: 'integer', minimum: 1 }
        : match[1] === 'task_id'
          ? { type: 'string', pattern: '^[a-z0-9_]{1,64}$' }
          : uuid,
  }));
  const responses: Record<string, unknown> = {
    [status]: envelope('Success'),
    401: envelope('Session required'),
    403: envelope('Permission denied or email unverified'),
    404: envelope('Not found in this workspace'),
    409: envelope('Conflict or stale version'),
    422: envelope('Invalid input'),
  };
  if (upstream)
    Object.assign(responses, {
      429: envelope('Scan quota exceeded; Retry-After header'),
      502: envelope('Invalid upstream response'),
      503: envelope('Upstream unavailable'),
    });
  return {
    tags: ['Business profile and onboarding'],
    summary,
    security: [{ cookieAuth: [] }],
    parameters,
    ...(body
      ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } }
      : {}),
    responses,
  };
}

export function businessProfilePaths(): Record<string, unknown> {
  const base = '/api/v1/workspaces/{workspace_id}';
  const paths: Record<string, Record<string, unknown>> = {};
  const add = (
    path: string,
    method: string,
    summary: string,
    status = 200,
    body?: Record<string, unknown>,
    upstream = false,
  ) => {
    (paths[path] ??= {})[method] = operation(summary, path, status, body, upstream);
  };
  add(
    '/api/v1/me/first-workspace',
    'post',
    'Create the verified account’s first provisional workspace',
    201,
  );
  add(
    `${base}/onboarding`,
    'get',
    'Read resumable onboarding state and checklist without creating rows',
  );
  add(
    `${base}/onboarding`,
    'patch',
    'Save or skip one validated onboarding step',
    200,
    object(
      {
        step: { type: 'integer', minimum: 1, maximum: 5 },
        action: { type: 'string', enum: ['save', 'skip'] },
        answers: {
          type: 'object',
          description: 'Strict per-step fields; see onboarding_and_business_profile_endpoints.md',
        },
      },
      ['step', 'action'],
    ),
  );
  add(
    `${base}/onboarding/complete`,
    'post',
    'Confirm the owner’s profile and complete onboarding',
    200,
    object({
      profile: object(profileFields),
      ...provenance,
      offerings: { type: 'array', maxItems: 50, items: object(offering, ['name']) },
      policies: { type: 'array', maxItems: 30, items: object(policy, ['kind', 'title', 'body']) },
    }),
  );
  add(`${base}/onboarding/first-tasks`, 'get', 'Get three localized first-task suggestions');
  add(
    `${base}/onboarding/first-tasks/{task_id}/dismiss`,
    'post',
    'Dismiss a personal task suggestion for seven days',
  );
  add(`${base}/profile`, 'get', 'Read the Business Profile, offerings and policies');
  add(
    `${base}/profile`,
    'put',
    'Confirm profile fields; null clears, omitted fields stay unchanged',
    200,
    object({ ...profileFields, ...provenance, base_version: { type: 'integer', minimum: 0 } }),
  );
  add(
    `${base}/profile/pack`,
    'get',
    'Read the confirmed-only profile pack capped at 2000 estimated tokens',
  );
  add(`${base}/profile/versions`, 'get', 'List profile versions, newest first');
  add(`${base}/profile/versions/{version}`, 'get', 'Read a historical profile snapshot');
  add(`${base}/profile/versions/{version}/restore`, 'post', 'Restore a snapshot as a new version');
  for (const [resource, id, fields, required] of [
    ['offerings', 'offering_id', offering, ['name']],
    ['policies', 'policy_id', policy, ['kind', 'title', 'body']],
  ] as const) {
    add(`${base}/profile/${resource}`, 'get', `List confirmed and unconfirmed ${resource}`);
    add(
      `${base}/profile/${resource}`,
      'post',
      `Create a profile ${resource} entry`,
      201,
      object(fields, [...required]),
    );
    const { source: _source, ...updateFields } = fields;
    void _source;
    add(
      `${base}/profile/${resource}/{${id}}`,
      'patch',
      `Update a profile ${resource} entry`,
      200,
      object({
        ...updateFields,
        ...(resource === 'offerings'
          ? { position: { type: 'integer', minimum: 0, maximum: 49 } }
          : {}),
      }),
    );
    add(`${base}/profile/${resource}/{${id}}`, 'delete', `Delete a profile ${resource} entry`);
  }
  add(
    `${base}/profile/scans`,
    'post',
    'Scan a public website for evidence-backed suggestions; never auto-confirm',
    201,
    object(
      {
        source_url: { type: 'string', minLength: 1, maxLength: 2048 },
        locale: { type: 'string', enum: ['id', 'en'] },
      },
      ['source_url'],
    ),
    true,
  );
  add(`${base}/profile/scans/{scan_id}`, 'get', 'Read an unexpired scan result');
  add(
    `${base}/profile/scans/{scan_id}`,
    'delete',
    'Discard a scan without resetting its rolling quota',
  );
  return paths;
}
