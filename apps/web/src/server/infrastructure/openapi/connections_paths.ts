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

export function getConnectionsPaths(): Record<string, unknown> {
  return {
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
