import 'server-only';
import { businessProfilePaths } from './business_profile_paths';
import { membersPaths } from './members_paths';
import { getInboxPaths } from './inbox_paths';
import { LIBRARY_COMPONENT_SCHEMAS, libraryOpenApiPaths } from './library_paths';

// Response object of the standard envelope, for the profile family below.
function envelopeResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } } },
  };
}

const PROFILE_PATCH_PROPERTIES = {
  full_name: {
    type: 'string',
    minLength: 2,
    maxLength: 100,
    description: 'Letters, spaces, apostrophe, period and hyphen; trimmed',
  },
  preferred_name: { type: ['string', 'null'], minLength: 1, maxLength: 40 },
  salutation: { type: ['string', 'null'], enum: ['none', 'pak', 'bu', 'kak', 'mas', 'mbak', null] },
  phone_number: {
    type: ['string', 'null'],
    description:
      'Normalised to E.164 (0812... becomes +62812...). Changing it clears phone_verified',
  },
  about_me: { type: ['string', 'null'], maxLength: 280 },
  use_profile_in_context: { type: 'boolean' },
  locale: { type: 'string', description: 'A code enabled in the locale registry (packages/i18n)' },
  timezone: { type: 'string', description: 'IANA time zone, for example Asia/Jakarta' },
};

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
        description:
          'Specialist roster: sineva-ai catalog merged with the static presentation manifest',
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
        name: 'Profile',
        description:
          'Own profile, member attributes, avatar and UI preferences (/api/v1/me family)',
      },
      {
        name: 'Workspaces',
        description: 'Multi-tenant workspace lifecycle, isolation, and configuration',
      },
      {
        name: 'Members',
        description:
          'Members, roles, specialist scope, invitations and ownership transfer (ADR-0029)',
      },
      {
        name: 'Conversations',
        description:
          'Multi-tenant conversations and messages persistence and ownership (FR-HUB-20, FR-HUB-32)',
      },
      {
        name: 'Inbox',
        description:
          'Inbox items, approvals of drafts and input requests (FR-INBOX-01 to FR-INBOX-15)',
      },
      {
        name: 'Library',
        description:
          'Sino Library: documents, folders, scopes, uploads, quotas and retrieval tests (ADR-0030)',
      },
      {
        name: 'Internal',
        description: 'Internal service-to-service endpoints guarded by X-Internal-Api-Key',
      },
    ],
    paths: {
      ...membersPaths(),
      ...getInboxPaths(),
      ...libraryOpenApiPaths(),
      ...businessProfilePaths(),
      '/api/internal/v1/keys': {
        get: {
          tags: ['Internal'],
          summary: 'Retrieve valid public signing keys for context verification',
          description:
            'Guarded by X-Internal-Api-Key. Used by internal services to fetch valid Ed25519 public keys during key rotation.',
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
      ...Object.fromEntries(
        ['/internal/v1/audit-events', '/api/internal/v1/audit-events'].map((path) => [
          path,
          {
            post: {
              tags: ['Internal'],
              summary: 'Record an audit event reported by sineva-ai',
              description:
                'Guarded by X-Internal-Api-Key only (sineva-ai cannot mint a signed context). actor_type is limited to specialist or system. A workspace_id, when present, must belong to an existing workspace. Message text, tokens and personal data are never stored: sensitive metadata keys are redacted.',
              operationId: path.startsWith('/api')
                ? 'ingest_audit_event_api_alias'
                : 'ingest_audit_event',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['actor_type', 'actor_id', 'action'],
                      properties: {
                        workspace_id: { type: 'string', format: 'uuid', nullable: true },
                        actor_type: { type: 'string', enum: ['specialist', 'system'] },
                        actor_id: { type: 'string' },
                        on_behalf_of_user_id: { type: 'string', nullable: true },
                        action: { type: 'string', example: 'session.access_denied' },
                        target_type: { type: 'string', nullable: true },
                        target_id: { type: 'string', nullable: true },
                        outcome: {
                          type: 'string',
                          enum: ['allowed', 'denied', 'error'],
                          default: 'allowed',
                        },
                        reason_code: { type: 'string', nullable: true },
                        request_id: { type: 'string', nullable: true },
                        run_id: { type: 'string', nullable: true },
                        metadata: { type: 'object', additionalProperties: true, nullable: true },
                      },
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Event recorded',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/StandardEnvelope' },
                    },
                  },
                },
                '401': {
                  description: 'Missing or invalid X-Internal-Api-Key header',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/StandardEnvelope' },
                    },
                  },
                },
                '404': {
                  description: 'workspace_id does not match an existing workspace',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/StandardEnvelope' },
                    },
                  },
                },
                '422': {
                  description: 'Body failed validation',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/StandardEnvelope' },
                    },
                  },
                },
                '500': {
                  description:
                    'The audit write failed; the event was not recorded and the caller must retry or count the failure',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/StandardEnvelope' },
                    },
                  },
                },
              },
            },
          },
        ]),
      ),
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
      '/api/v1/workspaces/{workspace_id}/agents': {
        get: {
          tags: ['Agents'],
          summary: 'List the specialists of a workspace',
          description:
            "sineva-ai's specialist catalog (GET /api/v2/agents) merged with the platform's static presentation manifest. " +
            'Availability (existence, wave, status, category) comes from sineva-ai on every call; display copy (role title, description, ' +
            'starter prompts in en and id), accent_key, room_theme_id and order come from the manifest. ' +
            'When sineva-ai is unreachable the answer is 503, and when it answers badly 502: the manifest is never served as a roster. ' +
            '`enabled` is derived in this release (a wave 1 specialist that sineva-ai reports live is on) because per-workspace enablement ' +
            'arrives with workspace_specialists; it is not a stored setting yet. ' +
            '`my_access` is computed from the caller role and specialist scope; a specialist the caller may not use has the same shape as one that is not enabled. ' +
            'The roster is returned whole, without pagination.',
          operationId: 'list_workspace_agents',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
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
                  'personal_ops',
                  'content_studio',
                  'marketplace_ops',
                  'it_security',
                  'tax_compliance',
                  'legal_drafting',
                  'inventory_procurement',
                ],
              },
            },
          ],
          responses: {
            '200': {
              description:
                'The specialist roster with the sineva-ai catalog_version it was built from',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } },
              },
            },
            '404': {
              description: 'Workspace not found, or the caller is not a member',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } },
              },
            },
            '422': {
              description: 'Invalid category_filter',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } },
              },
            },
            '502': {
              description:
                'sineva-ai answered badly, or its catalog does not list a specialist this app presents',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } },
              },
            },
            '503': {
              description: 'sineva-ai is unreachable',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/StandardEnvelope' } },
              },
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
          description:
            'Optional body field next (string): an invitation or ownership link path, /invite/{token} or /ownership/{token}. When present it is appended to the verification email link as &next=..., so a person who signed up from an invitation lands back on it after verifying. Any other value is rejected with 422.',
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
              description:
                'Profile (alias of GET /api/v1/me without memberships): identity, name fields, phone, about_me, avatar_url, locale, timezone',
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
          summary:
            'Update the profile of the authenticated user (identity comes from the session, never the body)',
          operationId: 'update_my_profile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  minProperties: 1,
                  properties: PROFILE_PATCH_PROPERTIES,
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
              description:
                'Missing CSRF header (x-sineva-action) or a mismatched origin on a cookie-authenticated request',
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
              description:
                'Validation failed: empty body, unknown key, blank or over-long full_name, unsupported locale, invalid time zone',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/me': {
        get: {
          tags: ['Profile'],
          summary:
            'Get the profile and workspace memberships (with roles) of the authenticated user',
          operationId: 'get_me',
          responses: {
            '200': envelopeResponse(
              'Profile fields plus memberships: workspace_id, workspace_slug, workspace_name, role, job_title, department',
            ),
            '401': envelopeResponse('Unauthenticated'),
            '404': envelopeResponse('The session user no longer exists'),
          },
        },
        patch: {
          tags: ['Profile'],
          summary:
            'Update the editable profile fields of the authenticated user. Read-only fields (email, status, verification timestamps) are rejected',
          operationId: 'update_me',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  minProperties: 1,
                  properties: PROFILE_PATCH_PROPERTIES,
                },
              },
            },
          },
          responses: {
            '200': envelopeResponse('Updated profile with memberships'),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse(
              'Missing CSRF header (x-sineva-action) or a mismatched origin on a cookie-authenticated request',
            ),
            '404': envelopeResponse('The session user no longer exists'),
            '422': envelopeResponse(
              'Validation failed: empty body, unknown or read-only key, invalid name, salutation, phone number, about_me, locale or time zone',
            ),
          },
        },
      },
      '/api/v1/me/preferences': {
        get: {
          tags: ['Profile'],
          summary:
            'Get the UI preferences of the authenticated user (defaults when none were saved)',
          operationId: 'get_my_preferences',
          responses: {
            '200': envelopeResponse(
              'theme, density, focus_mode, reduce_motion, sidebar_collapsed, pause_character, room_view',
            ),
            '401': envelopeResponse('Unauthenticated'),
          },
        },
        patch: {
          tags: ['Profile'],
          summary: 'Update UI preferences; only the provided fields change',
          operationId: 'update_my_preferences',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  minProperties: 1,
                  properties: {
                    theme: { type: 'string', enum: ['light', 'dark', 'system'] },
                    density: { type: 'string', enum: ['comfortable', 'compact'] },
                    focus_mode: { type: 'boolean' },
                    reduce_motion: { type: 'boolean' },
                    sidebar_collapsed: { type: 'boolean' },
                    pause_character: { type: 'boolean' },
                    room_view: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': envelopeResponse('Updated preferences'),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse('Missing CSRF header or a mismatched origin'),
            '422': envelopeResponse(
              'Validation failed: empty body, unknown key or an invalid value',
            ),
          },
        },
      },
      '/api/v1/me/avatar': {
        get: {
          tags: ['Profile'],
          summary: 'Read the avatar image of the authenticated user (WebP, private cache)',
          operationId: 'get_my_avatar',
          parameters: [
            {
              name: 'size',
              in: 'query',
              required: false,
              schema: { type: 'integer', enum: [256, 64], default: 256 },
            },
          ],
          responses: {
            '200': {
              description: 'The image bytes',
              content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
            },
            '401': envelopeResponse('Unauthenticated'),
            '404': envelopeResponse('No avatar set'),
            '422': envelopeResponse('Unsupported size'),
            '502': envelopeResponse('The storage service did not answer correctly'),
          },
        },
        post: {
          tags: ['Profile'],
          summary:
            'Step 1 of an avatar upload: returns a presigned PUT URL for a pending object (JPEG, PNG or WebP, up to 2 MB)',
          operationId: 'request_my_avatar_upload',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['content_type', 'file_size_bytes'],
                  properties: {
                    content_type: {
                      type: 'string',
                      enum: ['image/jpeg', 'image/png', 'image/webp'],
                    },
                    file_size_bytes: { type: 'integer', minimum: 1, maximum: 2097152 },
                  },
                },
              },
            },
          },
          responses: {
            '201': envelopeResponse(
              'upload_id, upload_url, method, headers, expires_in_seconds, max_bytes',
            ),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse('Missing CSRF header or a mismatched origin'),
            '422': envelopeResponse('Unsupported type or size'),
            '502': envelopeResponse('The storage service could not sign the request'),
          },
        },
        delete: {
          tags: ['Profile'],
          summary: 'Remove the avatar (both stored sizes)',
          operationId: 'delete_my_avatar',
          responses: {
            '200': envelopeResponse('The profile without an avatar'),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse('Missing CSRF header or a mismatched origin'),
            '502': envelopeResponse('The storage service did not answer correctly'),
          },
        },
      },
      '/api/v1/me/avatar/complete': {
        post: {
          tags: ['Profile'],
          summary:
            'Step 2 of an avatar upload: the server reads the uploaded object, checks the magic bytes, re-encodes to square WebP at 256 and 64 px without metadata and switches the avatar',
          operationId: 'complete_my_avatar_upload',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['upload_id'],
                  properties: { upload_id: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
          responses: {
            '200': envelopeResponse('Updated profile'),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse('Missing CSRF header or a mismatched origin'),
            '404': envelopeResponse('Nothing was uploaded under that upload_id for this user'),
            '422': envelopeResponse(
              'Not a JPEG, PNG or WebP (SVG and other types are refused), over 2 MB, or not decodable',
            ),
            '502': envelopeResponse('The storage service did not answer correctly'),
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}/members/me': {
        patch: {
          tags: ['Profile'],
          summary: 'Update job_title and department of the caller own membership in this workspace',
          operationId: 'update_my_member_profile',
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
                  additionalProperties: false,
                  minProperties: 1,
                  properties: {
                    job_title: { type: ['string', 'null'], maxLength: 60 },
                    department: {
                      type: ['string', 'null'],
                      enum: [
                        'management',
                        'finance',
                        'sales',
                        'marketing',
                        'operations',
                        'hr',
                        'it',
                        'customer_support',
                        'legal',
                        'other',
                        null,
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': envelopeResponse('job_title and department'),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse('Missing CSRF header or a mismatched origin'),
            '404': envelopeResponse('The caller is not a member of this workspace'),
            '422': envelopeResponse('Validation failed'),
          },
        },
        delete: {
          tags: ['Members'],
          summary: 'Leave this workspace',
          description:
            'Any role except the owner. The owner gets 409 last_owner and must transfer ownership first. Sessions pinned to the workspace are revoked and authored content stays attributed to a Former member.',
          operationId: 'leave_workspace',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': envelopeResponse('Left the workspace'),
            '401': envelopeResponse('Unauthenticated'),
            '403': envelopeResponse('Missing CSRF header or a mismatched origin'),
            '404': envelopeResponse('The caller is not a member of this workspace'),
            '409': envelopeResponse('last_owner'),
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
        patch: {
          tags: ['Conversations'],
          summary: 'Rename a conversation',
          description:
            "Sets the title (trimmed, 1 to 120 characters) and marks it as the caller's own (`title_source = user`), so automatic titles never overwrite it. Only the owner can rename; anyone else gets 404 (FR-HUB-32).",
          operationId: 'rename_conversation',
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
                  required: ['title'],
                  properties: {
                    title: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 120,
                      example: 'Q4 budget review',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The renamed conversation',
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
              description: 'The role cannot manage chats (viewer)',
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
              description: 'Title missing, empty after trimming, or longer than 120 characters',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Conversations'],
          summary: 'Delete a conversation',
          description:
            'Permanently deletes the conversation with its messages and chat runs in one transaction, after cancelling any active run. Cannot be undone. Attachments in object storage are purged by the retention job. Only the owner can delete; anyone else gets 404 (FR-HUB-32).',
          operationId: 'delete_conversation',
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
              description: 'Deleted; data is { id, deleted: true }',
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
              description: 'The role cannot manage chats (viewer)',
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
          description:
            'Each message carries `cards[]`: the typed result cards of an assistant message, validated again and upcast on read (ADR-0025). A rejected card has empty `data`, its `rejected_code` and its `fallback_text`.',
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
              description:
                'Message processed and run allocated (returns message_id and run_id handle, D-M0-3)',
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
              description:
                'Validation failed (e.g. content exceeds 8,000 chars or room specialist mismatch)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}/runs/{run_id}/events': {
        get: {
          tags: ['Conversations'],
          summary: 'Stream a run as Server-Sent Events (step 2 of run flow)',
          description:
            'Relays the sineva-ai v2 event stream (token, run_started, status, usage, done, error, heartbeat comments). ' +
            'The first attach starts the run; the relay keeps draining and stores the reply when the browser leaves. ' +
            'Reconnect with the Last-Event-ID header to resume. Failures after the stream opened arrive as a typed `error` event (for example code upstream_unavailable, status 503), never as silence. ' +
            'Node runtime, no buffering, no compression.',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'run_id',
              in: 'path',
              required: true,
              description:
                'Run handle returned by POST .../messages (run_<uuid>), not the sineva-ai run id (ADR-0022)',
              schema: { type: 'string' },
            },
            {
              name: 'Last-Event-ID',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'text/event-stream',
              content: { 'text/event-stream': { schema: { type: 'string' } } },
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
              description: 'Forbidden (viewer role lacks chat.send)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description:
                'Run not found or not owned by caller (FR-HUB-32); same answer for another workspace',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
          },
        },
      },
      '/api/v1/workspaces/{workspace_id}/runs/{run_id}/cancel': {
        post: {
          tags: ['Conversations'],
          summary: 'Stop a streaming run (FR-HUB-21)',
          description:
            'Asks sineva-ai to cancel. The text streamed so far is kept and the reply is stored with status cancelled. ' +
            'A run that already finished answers 200 with its final status.',
          parameters: [
            {
              name: 'workspace_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'run_id',
              in: 'path',
              required: true,
              description:
                'Run handle returned by POST .../messages (run_<uuid>), not the sineva-ai run id (ADR-0022)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Stop requested (status cancelling) or the final status of a finished run',
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
              description: 'Forbidden (viewer role lacks chat.send)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '404': {
              description: 'Run not found or not owned by caller (FR-HUB-32)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '409': {
              description:
                'The run cannot be stopped right now (no upstream run id yet and no live stream on this instance)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '502': {
              description: 'sineva-ai answered the cancel with something unexpected',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                },
              },
            },
            '503': {
              description: 'sineva-ai could not be reached for the cancel',
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
        ...LIBRARY_COMPONENT_SCHEMAS,
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
        PresignUploadRequest: {
          type: 'object',
          required: ['file_name', 'content_type', 'file_size_bytes'],
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
