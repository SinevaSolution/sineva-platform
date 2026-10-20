import { describe, expect, it } from 'vitest';
import {
  assertSnakeCaseKeys,
  createErrorResponse,
  createPaginatedResponse,
  createSuccessResponse,
  toSnakeCase,
} from './index';

describe('@sineva/shared response utility', () => {
  it('creates a standard snake_case success response envelope', () => {
    const res = createSuccessResponse({
      data: { agent_slug: 'sino-people', active_sessions: 4 },
      message: 'Agent details fetched',
      status: 200,
      request_id: 'req_test_001',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe(200);
    expect(res.message).toBe('Agent details fetched');
    expect(res.data).toEqual({ agent_slug: 'sino-people', active_sessions: 4 });
    expect(res.meta?.request_id).toBe('req_test_001');
    expect(res.errors).toBeNull();
    expect(assertSnakeCaseKeys(res.data as Record<string, unknown>)).toBe(true);
  });

  it('creates a standard snake_case paginated response envelope', () => {
    const res = createPaginatedResponse({
      items: [{ agent_slug: 'sino-finance' }],
      page: 1,
      per_page: 10,
      total_items: 6,
      message: 'Agents fetched successfully',
      request_id: 'req_test_002',
    });

    expect(res.success).toBe(true);
    expect(res.meta).toMatchObject({
      page: 1,
      per_page: 10,
      total_items: 6,
      total_pages: 1,
      has_next: false,
      has_prev: false,
      request_id: 'req_test_002',
    });
    expect(assertSnakeCaseKeys(res.meta as unknown as Record<string, unknown>)).toBe(true);
  });

  it('creates a standard snake_case error response envelope', () => {
    const res = createErrorResponse({
      message: 'Validation failed',
      status: 422,
      errors: [
        {
          code: 'INVALID_FIELD',
          field: 'message_text',
          detail: 'message_text must not be empty',
        },
      ],
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe(422);
    expect(res.data).toBeNull();
    expect(res.errors?.[0]?.field).toBe('message_text');
  });

  it('converts camelCase and kebab-case strings to snake_case', () => {
    expect(toSnakeCase('workspaceId')).toBe('workspace_id');
    expect(toSnakeCase('sino-people')).toBe('sino_people');
  });
});
