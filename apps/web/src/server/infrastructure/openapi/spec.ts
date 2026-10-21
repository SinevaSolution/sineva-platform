import 'server-only';

function errorExample(
  status: number,
  message: string,
  code: string,
  field: string | null = null,
  detail: string = message,
) {
  return {
    success: false,
    status,
    message,
    data: null,
    meta: {
      request_id: 'req_1760980000_ab12cd',
      timestamp: '2026-10-21T01:44:35.000Z',
    },
    errors: [{ code, field, detail }],
  };
}

export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sineva Platform Unified REST & BFF API',
      version: '1.0.0',
      description:
        'Standardized snake_case REST API for the Sineva AI Companion Platform. Bridges client workspaces to PostgreSQL (Prisma), Redis, SeaweedFS S3, and the internal sineva-ai FastAPI engine.',
      contact: {
        name: 'Sineva Platform Architecture Team',
        url: 'https://sineva.id',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development & Docker Compose Gateway',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Shared infrastructure & internal AI gateway readiness',
      },
      {
        name: 'Agents',
        description: 'Specialized AI companion registry',
      },
      {
        name: 'Storage',
        description: 'SeaweedFS S3 presigned upload workflows',
      },
      {
        name: 'Auth',
        description: 'Identity, custom JWT authentication, session, and password lifecycle',
      },
      {
        name: 'Workspaces',
        description: 'Multi-tenant workspace lifecycle, isolation, and configuration',
      },
      {
        name: 'Conversations',
        description: 'Multi-tenant conversations and messages persistence and ownership (FR-HUB-20, FR-HUB-32)',
      },
      {
        name: 'Internal',
        description: 'Internal service-to-service endpoints guarded by X-Internal-Api-Key',
      },
    ],
    paths: {
      '/api/internal/v1/keys': {
        get: {
          tags: ['Internal'],
          summary: 'Retrieve valid public signing keys for context verification',
          description: 'Guarded by X-Internal-Api-Key. Used by internal services to fetch valid Ed25519 public keys during key rotation.',
          operationId: 'list_internal_signing_keys',
          responses: {
            '200': {
              description: 'List of valid public signing keys',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
            '401': {
              description: 'Missing or invalid X-Internal-Api-Key header',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'Inspect system & shared infrastructure health',
          operationId: 'get_system_health',
          responses: {
            '200': {
              description: 'Standard snake_case health envelope',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
            '503': {
              description: 'Subsystem in standby or dependency unavailable',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents': {
        get: {
          tags: ['Agents'],
          summary: 'List specialized Sineva AI companions with pagination',
          operationId: 'list_agents',
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 1 },
            },
            {
              name: 'per_page',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 10 },
            },
            {
              name: 'category_filter',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: [
                  'people_hr',
                  'finance_ops',
                  'sales_growth',
                  'social_marketing',
                  'customer_support',
                  'data_insights',
                ],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Paginated list of specialized AI companions',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Agents'],
          summary: 'Register a custom workspace AI companion configuration',
          operationId: 'create_agent',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CreateAgentRequest',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Created agent companion configuration',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
            '409': {
              description: 'An agent with this agent_slug already exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                  example: errorExample(
                    409,
                    "Agent 'sinofinance' already exists",
                    'RESOURCE_CONFLICT',
                  ),
                },
              },
            },
            '422': {
              description: 'Validation error',
            },
          },
        },
      },
      '/api/v1/storage/presign': {
        post: {
          tags: ['Storage'],
          summary: 'Generate a SeaweedFS S3 presigned upload URL',
          operationId: 'presign_storage_upload',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PresignUploadRequest',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Presigned S3 upload URL metadata',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/sign-up': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user account with email and password',
          operationId: 'auth_sign_up',
          responses: {
            '201': {
              description: 'User registered successfully and verification email dispatched',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Validation failed (e.g. password policy or breached password)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/sign-in': {
        post: {
          tags: ['Auth'],
          summary: 'Authenticate with email and password, setting secure session cookie',
          operationId: 'auth_sign_in',
          responses: {
            '200': {
              description: 'Signed in successfully with JWT session cookie',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '403': {
              description: 'Account locked out due to consecutive failed attempts',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/sign-out': {
        post: {
          tags: ['Auth'],
          summary: 'Sign out and revoke active session',
          operationId: 'auth_sign_out',
          responses: {
            '200': {
              description: 'Signed out and session cookie cleared',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/request-password-reset': {
        post: {
          tags: ['Auth'],
          summary: 'Request a password reset link (non-enumerating)',
          operationId: 'auth_request_password_reset',
          responses: {
            '200': {
              description: 'Password reset email dispatched if account exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password using one-time verification token',
          operationId: 'auth_reset_password',
          responses: {
            '200': {
              description: 'Password updated and previous sessions revoked',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Invalid or expired reset token or invalid password',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/verify-email': {
        get: {
          tags: ['Auth'],
          summary: 'Verify user email address via link query parameter',
          operationId: 'auth_verify_email_get',
          parameters: [
            {
              name: 'token',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Email verified successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Auth'],
          summary: 'Verify user email address via JSON token',
          operationId: 'auth_verify_email_post',
          responses: {
            '200': {
              description: 'Email verified successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/reauthenticate': {
        post: {
          tags: ['Auth'],
          summary: 'Re-authenticate with current password to extend fresh session window',
          operationId: 'auth_reauthenticate',
          responses: {
            '200': {
              description: 'Session fresh window extended',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Invalid password or unauthenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/session': {
        get: {
          tags: ['Auth'],
          summary: 'Retrieve currently authenticated session and membership details',
          operationId: 'auth_get_session',
          responses: {
            '200': {
              description: 'Active session details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'No active session',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/oauth/{provider}': {
        get: {
          tags: ['Auth'],
          summary: 'Initiate OAuth 2.0 / OIDC authorization flow with PKCE S256',
          operationId: 'auth_oauth_initiate',
          parameters: [
            {
              name: 'provider',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['google', 'github'] },
            },
            {
              name: 'return_to',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '302': {
              description: 'Redirect to external OAuth authorization URL',
            },
          },
        },
      },
      '/api/v1/auth/oauth/{provider}/callback': {
        get: {
          tags: ['Auth'],
          summary: 'Handle OAuth callback, exchange authorization code, and authenticate user',
          operationId: 'auth_oauth_callback',
          parameters: [
            {
              name: 'provider',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['google', 'github'] },
            },
            {
              name: 'code',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'state',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '302': {
              description: 'Redirect to destination with session cookie set',
            },
            '400': {
              description: 'State mismatch, invalid code, or unverified email',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/me/accounts': {
        get: {
          tags: ['Auth'],
          summary: 'List linked OAuth and credential sign-in accounts for the authenticated user',
          operationId: 'auth_list_accounts',
          responses: {
            '200': {
              description: 'List of linked sign-in accounts',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Unauthenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/me/accounts/{provider}': {
        delete: {
          tags: ['Auth'],
          summary: 'Unlink an OAuth provider from user account (requires fresh session)',
          operationId: 'auth_unlink_account',
          parameters: [
            {
              name: 'provider',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['google', 'github'] },
            },
          ],
          responses: {
            '200': {
              description: 'Account unlinked successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '400': {
              description: 'Cannot remove the last sign-in method',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '403': {
              description: 'Fresh session required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Account not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/me/profile': {
        get: {
          tags: ['Auth'],
          summary: 'Get the profile of the authenticated user',
          operationId: 'get_my_profile',
          responses: {
            '200': {
              description: 'Profile: id, email, email_verified, full_name, avatar_url, locale, timezone, created_at',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Unauthenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'The session user no longer exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        patch: {
          tags: ['Auth'],
          summary: 'Update the profile of the authenticated user (identity comes from the session, never the body)',
          operationId: 'update_my_profile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  minProperties: 1,
                  properties: {
                    full_name: { type: 'string', minLength: 1, maxLength: 100, description: 'Trimmed before validation' },
                    locale: { type: 'string', enum: ['en', 'id'] },
                    timezone: { type: 'string', description: 'IANA time zone, for example Asia/Jakarta' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Updated profile',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Unauthenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '403': {
              description: 'Missing CSRF header (x-sineva-action) or a mismatched origin on a cookie-authenticated request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'The session user no longer exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Validation failed: empty body, unknown key, blank or over-long full_name, unsupported locale, invalid time zone',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces': {
        get: {
          tags: ['Workspaces'],
          summary: 'List workspaces for the current authenticated user',
          operationId: 'list_workspaces',
          responses: {
            '200': {
              description: 'User workspaces and role list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Workspaces'],
          summary: 'Create a new workspace tenant',
          operationId: 'create_workspace',
          responses: {
            '201': {
              description: 'Workspace created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Invalid input or reserved slug',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}': {
        get: {
          tags: ['Workspaces'],
          summary: 'Get details for a workspace',
          operationId: 'get_workspace',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Workspace details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Workspace not found or caller has no membership (FR-AUTH-24)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        patch: {
          tags: ['Workspaces'],
          summary: 'Update workspace settings and slug (slug editable once, FR-SHELL-13)',
          operationId: 'update_workspace',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Workspace updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '403': {
              description: 'Forbidden: caller role lacks workspace.update permission',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Workspace not found or caller has no membership (FR-AUTH-24)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Validation failed (e.g. slug already customized once)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}/conversations': {
        get: {
          tags: ['Conversations'],
          summary: 'List user conversations in workspace',
          operationId: 'list_conversations',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'kind',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['hub', 'room'] },
            },
            {
              name: 'agent_slug',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: 'List of conversations',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Workspace not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Conversations'],
          summary: 'Create a new conversation (hub or room)',
          operationId: 'create_conversation',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['kind'],
                  properties: {
                    kind: { type: 'string', enum: ['hub', 'room'] },
                    agent_slug: { type: 'string', nullable: true },
                    title: { type: 'string', maxLength: 255, nullable: true },
                    origin_message_id: { type: 'string', format: 'uuid', nullable: true },
                    origin_channel: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Conversation created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '403': {
              description: 'Forbidden (e.g. viewer role lacks chat.send)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Workspace not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Validation failed (e.g. room missing pinned agent_slug)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}/conversations/{conversation_id}': {
        get: {
          tags: ['Conversations'],
          summary: 'Get details for a conversation',
          operationId: 'get_conversation',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'conversation_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Conversation details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Conversation not found or not owned by caller (FR-HUB-32)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}/conversations/{conversation_id}/messages': {
        get: {
          tags: ['Conversations'],
          summary: 'List messages in a conversation in chronological order',
          operationId: 'list_conversation_messages',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'conversation_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: 'List of messages in chronological order',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Conversation not found or not owned by caller (FR-HUB-32)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Conversations'],
          summary: 'Send a message in a conversation (step 1 of run flow)',
          operationId: 'create_conversation_message',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'conversation_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content: { type: 'string', minLength: 1, maxLength: 8000 },
                    client_message_id: { type: 'string', maxLength: 255, nullable: true },
                    mentions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { agent_slug: { type: 'string' } },
                      },
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Message processed and run allocated (returns message_id and run_id handle, D-M0-3)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '403': {
              description: 'Forbidden (e.g. viewer role lacks chat.send)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Conversation not found or not owned by caller (FR-HUB-32)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '422': {
              description: 'Validation failed (e.g. content exceeds 8,000 chars or room specialist mismatch)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        StandardEnvelope: {
          type: 'object',
          required: ['success', 'status', 'message', 'data', 'meta', 'errors'],
          properties: {
            success: { type: 'boolean', example: true },
            status: { type: 'integer', example: 200 },
            message: {
              type: 'string',
              example: 'Operation completed successfully',
            },
            code: {
              type: 'string',
              enum: [
                'validation_failed',
                'unauthenticated',
                'forbidden',
                'not_found',
                'conflict',
                'model_unavailable',
                'dependency_unavailable',
                'internal_error',
              ],
              example: 'validation_failed',
              description: 'Stable machine code mapped to client message keys (FR-UX-31)',
            },
            data: { type: ['object', 'array', 'null'] },
            meta: {
              type: ['object', 'null'],
              properties: {
                page: { type: 'integer', example: 1 },
                per_page: { type: 'integer', example: 10 },
                total_items: { type: 'integer', example: 6 },
                total_pages: { type: 'integer', example: 1 },
                has_next: { type: 'boolean', example: false },
                has_prev: { type: 'boolean', example: false },
                request_id: { type: 'string', example: 'req_1760980000_ab12cd' },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
            errors: {
              type: ['array', 'null'],
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  field: { type: ['string', 'null'] },
                  detail: { type: 'string' },
                },
              },
            },
          },
        },
        CreateAgentRequest: {
          type: 'object',
          required: [
            'agent_slug',
            'display_name',
            'role_title',
            'category',
            'short_description',
            'capabilities',
          ],
          properties: {
            agent_slug: { type: 'string', example: 'sinolegal' },
            display_name: { type: 'string', example: 'SinoLegal' },
            role_title: {
              type: 'string',
              example: 'Contract & Compliance Counsel',
            },
            category: { type: 'string', example: 'finance_ops' },
            short_description: {
              type: 'string',
              example: 'Reviews MSA clauses and DPA schedules.',
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              example: ['msa_redlining', 'gdpr_dpa_audit'],
            },
            model_name: { type: 'string', example: 'sineva-core-v2' },
          },
        },
        PresignUploadRequest: {
          type: 'object',
          required: [
            'file_name',
            'content_type',
            'file_size_bytes',
          ],
          properties: {
            file_name: { type: 'string', example: 'q3_board_deck.pdf' },
            content_type: { type: 'string', example: 'application/pdf' },
            file_size_bytes: { type: 'integer', example: 2048576 },
          },
        },
      },
    },
  };
}
