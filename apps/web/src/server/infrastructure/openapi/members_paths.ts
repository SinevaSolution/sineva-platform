import 'server-only';

// OpenAPI paths of the members, invitations and ownership-transfer routes
// (ADR-0029). Kept in its own file because the main spec is already long; it
// is spread into `paths` by `getOpenApiSpec`.

function envelope(description: string, data?: Record<string, unknown>) {
  return {
    description,
    content: {
      'application/json': {
        schema: data
          ? { allOf: [{ $ref: '#/components/schemas/StandardEnvelope' }, { type: 'object', properties: { data } }] }
          : { $ref: '#/components/schemas/StandardEnvelope' },
      },
    },
  };
}

const workspaceParam = { name: 'workspace_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const memberParam = { name: 'member_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const invitationParam = { name: 'invitation_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const tokenParam = {
  name: 'token',
  in: 'path',
  required: true,
  description: 'The 256-bit link token from the emailed or copied link (base64url)',
  schema: { type: 'string', minLength: 16, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' },
};

const ROLE = { type: 'string', enum: ['owner', 'admin', 'member', 'viewer'] };
const ASSIGNABLE_ROLE = { type: 'string', enum: ['admin', 'member', 'viewer'] };
const SCOPE = { type: 'string', enum: ['all', 'selected'] };
const SLUGS = { type: 'array', maxItems: 50, items: { type: 'string', description: 'agent_slug from the specialist manifest' } };

const MEMBER_VIEW = {
  type: 'object',
  description:
    'email, phone_number, last_active_at, specialist_scope and specialist_slugs are present only for callers with member.view_contact (owner, admin); they are absent, not null, for others.',
  properties: {
    id: { type: 'string', format: 'uuid' },
    display_name: { type: 'string' },
    avatar_url: { type: ['string', 'null'] },
    role: ROLE,
    job_title: { type: ['string', 'null'] },
    department: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['active'] },
    is_you: { type: 'boolean' },
    joined_at: { type: 'string', format: 'date-time' },
    email: { type: 'string', format: 'email' },
    phone_number: { type: ['string', 'null'] },
    last_active_at: { type: ['string', 'null'], format: 'date-time', description: 'Latest sign-in of the person' },
    specialist_scope: SCOPE,
    specialist_slugs: SLUGS,
  },
};

const INVITATION_VIEW = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    role: ASSIGNABLE_ROLE,
    specialist_scope: SCOPE,
    specialist_slugs: SLUGS,
    state: { type: 'string', enum: ['pending', 'expired'] },
    expires_at: { type: 'string', format: 'date-time' },
    last_sent_at: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const INVITATION_CREATED = {
  type: 'object',
  properties: {
    invitation: INVITATION_VIEW,
    invite_url: { type: 'string', description: 'Full link to copy into WhatsApp. Returned only by create and resend.' },
    replaced: { type: 'boolean' },
    email_sent: { type: 'boolean', description: 'False when the email transport failed; the link stays valid.' },
  },
};

const TRANSFER_VIEW = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    state: { type: 'string', enum: ['pending', 'expired'] },
    expires_at: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    target: {
      type: 'object',
      properties: { member_id: { type: ['string', 'null'], format: 'uuid' }, display_name: { type: 'string' } },
    },
  },
};

const COMMON_ERRORS = {
  '401': envelope('Unauthenticated'),
  '403': envelope('Missing CSRF header, a role that may not do this, or (for sensitive actions) a session that is not fresh'),
  '404': envelope('Workspace or target not found, or the caller is not a member of the workspace (never 403)'),
};

export function membersPaths(): Record<string, unknown> {
  return {
    '/api/v1/workspaces/{workspace_id}/members': {
      get: {
        tags: ['Members'],
        summary: 'List the members of a workspace',
        description: 'Every role may list. Contact fields need member.view_contact (owner, admin).',
        operationId: 'list_members',
        parameters: [workspaceParam],
        responses: {
          '200': envelope('Members', { type: 'array', items: MEMBER_VIEW }),
          '401': COMMON_ERRORS['401'],
          '404': COMMON_ERRORS['404'],
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/members/{member_id}': {
      get: {
        tags: ['Members'],
        summary: 'Get one member (the member detail drawer)',
        operationId: 'get_member',
        parameters: [workspaceParam, memberParam],
        responses: {
          '200': envelope('Member', MEMBER_VIEW),
          '401': COMMON_ERRORS['401'],
          '404': COMMON_ERRORS['404'],
          '422': envelope('member_id is not a UUID'),
        },
      },
      patch: {
        tags: ['Members'],
        summary: 'Change a member role and/or specialist scope',
        description:
          'Owner and admin only. Only the owner promotes or demotes admins; an admin moves members and viewers between those two roles. Nobody changes the owner role or sets owner (use transfer-ownership): the owner demoting themselves is 409 last_owner. Scope applies to role member only (422 scope_not_applicable). specialist_scope selected needs a non-empty list of manifest slugs (422 allowlist_required, unknown_specialist). Leaving the member role resets the scope to all.',
        operationId: 'update_member',
        parameters: [workspaceParam, memberParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: { role: ASSIGNABLE_ROLE, specialist_scope: SCOPE, specialist_slugs: SLUGS },
              },
            },
          },
        },
        responses: {
          '200': envelope('Updated member', MEMBER_VIEW),
          ...COMMON_ERRORS,
          '409': envelope('last_owner: the only owner cannot be demoted'),
          '422': envelope('Validation failed (empty body, owner role, slugs without selected, unknown slug, scope not applicable)'),
        },
      },
      delete: {
        tags: ['Members'],
        summary: 'Remove a member',
        description:
          'Needs a fresh session. Owner removes admins, members and viewers; an admin removes members and viewers. The owner can never be removed (409 last_owner). The membership is deleted, the person loses access to the workspace at once, sessions pinned to it are revoked and authored content stays attributed to a Former member.',
        operationId: 'remove_member',
        parameters: [workspaceParam, memberParam],
        responses: {
          '200': envelope('Member removed'),
          ...COMMON_ERRORS,
          '409': envelope('last_owner'),
          '422': envelope('member_id is not a UUID'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/members/{member_id}/specialists': {
      put: {
        tags: ['Members'],
        summary: 'Replace the specialist allowlist of a member and set the scope to selected',
        operationId: 'set_member_specialists',
        parameters: [workspaceParam, memberParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['specialist_slugs'],
                properties: { specialist_slugs: { ...SLUGS, minItems: 1 } },
              },
            },
          },
        },
        responses: {
          '200': envelope('Updated member', MEMBER_VIEW),
          ...COMMON_ERRORS,
          '422': envelope('Empty list, unknown slug (unknown_specialist) or a member that is not role member (scope_not_applicable)'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/invitations': {
      get: {
        tags: ['Members'],
        summary: 'List open invitations (pending and expired)',
        operationId: 'list_invitations',
        parameters: [workspaceParam],
        responses: {
          '200': envelope('Open invitations', { type: 'array', items: INVITATION_VIEW }),
          ...COMMON_ERRORS,
        },
      },
      post: {
        tags: ['Members'],
        summary: 'Invite a person by email',
        description:
          'Owner invites admin, member or viewer; an admin invites member or viewer. Re-inviting a pending address replaces the old invitation (old link dies). 409 already_member when the address is already in the workspace. The entitlement members.max is checked. The response is the only place (with resend) that carries invite_url.',
        operationId: 'create_invitation',
        parameters: [workspaceParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['email', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: ASSIGNABLE_ROLE,
                  specialist_scope: SCOPE,
                  specialist_slugs: SLUGS,
                },
              },
            },
          },
        },
        responses: {
          '201': envelope('Invitation created or replaced', INVITATION_CREATED),
          ...COMMON_ERRORS,
          '409': envelope('already_member'),
          '422': envelope('Validation failed (owner role, bad email, scope rules)'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}': {
      delete: {
        tags: ['Members'],
        summary: 'Revoke a pending invitation',
        operationId: 'revoke_invitation',
        parameters: [workspaceParam, invitationParam],
        responses: {
          '200': envelope('Invitation revoked'),
          ...COMMON_ERRORS,
          '422': envelope('invitation_id is not a UUID'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/resend': {
      post: {
        tags: ['Members'],
        summary: 'Resend an invitation with a new token and a fresh 7 days',
        operationId: 'resend_invitation',
        parameters: [workspaceParam, invitationParam],
        responses: {
          '200': envelope('Invitation resent', INVITATION_CREATED),
          ...COMMON_ERRORS,
          '422': envelope('invitation_id is not a UUID'),
        },
      },
    },
    '/api/v1/workspaces/{workspace_id}/transfer-ownership': {
      get: {
        tags: ['Members'],
        summary: 'The open ownership transfer of the workspace, or null',
        operationId: 'get_ownership_transfer',
        parameters: [workspaceParam],
        responses: {
          '200': envelope('Open transfer or null', TRANSFER_VIEW),
          ...COMMON_ERRORS,
        },
      },
      post: {
        tags: ['Members'],
        summary: 'Ask an existing admin to take over ownership',
        description:
          'Owner only, fresh session. The admin gets an email link to /ownership/{token}; nothing changes until they confirm. A new request replaces an open one. 422 target_must_be_admin otherwise.',
        operationId: 'request_ownership_transfer',
        parameters: [workspaceParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['target_member_id'],
                properties: { target_member_id: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
        responses: {
          '201': envelope('Transfer requested', TRANSFER_VIEW),
          ...COMMON_ERRORS,
          '422': envelope('target_must_be_admin or a malformed body'),
          '503': envelope('The email could not be sent; nothing was stored'),
        },
      },
      delete: {
        tags: ['Members'],
        summary: 'Cancel the open ownership transfer',
        operationId: 'cancel_ownership_transfer',
        parameters: [workspaceParam],
        responses: {
          '200': envelope('Transfer cancelled'),
          ...COMMON_ERRORS,
        },
      },
    },
    '/api/v1/invitations/{token}': {
      get: {
        tags: ['Members'],
        summary: 'Preview an invitation link (public)',
        description:
          'No session needed. Returns the workspace name, the inviter first name, the role and the link state (pending, expired, used, revoked). Never any email or id. With a session it adds email_matches_session (boolean) and nothing else.',
        operationId: 'preview_invitation',
        parameters: [tokenParam],
        responses: {
          '200': envelope('Invitation preview', {
            type: 'object',
            properties: {
              state: { type: 'string', enum: ['pending', 'expired', 'used', 'revoked'] },
              workspace_name: { type: 'string' },
              inviter_first_name: { type: ['string', 'null'] },
              role: ASSIGNABLE_ROLE,
              expires_at: { type: 'string', format: 'date-time' },
              email_matches_session: { type: ['boolean', 'null'] },
            },
          }),
          '404': envelope('invitation_not_found (unknown, or replaced by a newer link)'),
          '422': envelope('Malformed token'),
        },
      },
    },
    '/api/v1/invitations/{token}/accept': {
      post: {
        tags: ['Members'],
        summary: 'Accept an invitation',
        description:
          'Global path. Needs a session whose verified email equals the invited address (403 invitation_email_mismatch, 403 email_not_verified). Single use, 7 days. 409 with a code: invitation_expired, invitation_used, invitation_revoked, already_member. The entitlement members.max is checked.',
        operationId: 'accept_invitation',
        parameters: [tokenParam],
        responses: {
          '200': envelope('Joined', {
            type: 'object',
            properties: {
              workspace: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  workspace_slug: { type: 'string' },
                  workspace_name: { type: 'string' },
                },
              },
              role: ROLE,
            },
          }),
          '401': COMMON_ERRORS['401'],
          '403': envelope('invitation_email_mismatch, email_not_verified or a missing CSRF header'),
          '404': envelope('invitation_not_found'),
          '409': envelope('invitation_expired, invitation_used, invitation_revoked or already_member'),
          '422': envelope('Malformed token'),
        },
      },
    },
    '/api/v1/ownership-transfers/{token}': {
      get: {
        tags: ['Members'],
        summary: 'Preview an ownership transfer link (public)',
        description: 'Workspace name, previous owner first name, state and, with a session, is_target.',
        operationId: 'preview_ownership_transfer',
        parameters: [tokenParam],
        responses: {
          '200': envelope('Transfer preview', {
            type: 'object',
            properties: {
              state: { type: 'string', enum: ['pending', 'expired', 'used', 'cancelled'] },
              workspace_name: { type: 'string' },
              from_first_name: { type: ['string', 'null'] },
              expires_at: { type: 'string', format: 'date-time' },
              is_target: { type: ['boolean', 'null'] },
            },
          }),
          '404': envelope('ownership_transfer_not_found'),
          '422': envelope('Malformed token'),
        },
      },
    },
    '/api/v1/ownership-transfers/{token}/accept': {
      post: {
        tags: ['Members'],
        summary: 'Confirm an ownership transfer',
        description:
          'Global path. Only the chosen admin, with a fresh session. Swaps the roles atomically (previous owner becomes admin) and emails both. 409: ownership_transfer_expired, _used, _cancelled or _stale (a party changed role meanwhile).',
        operationId: 'accept_ownership_transfer',
        parameters: [tokenParam],
        responses: {
          '200': envelope('Ownership transferred', {
            type: 'object',
            properties: {
              workspace: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  workspace_slug: { type: 'string' },
                  workspace_name: { type: 'string' },
                },
              },
              notices_sent: { type: 'boolean' },
            },
          }),
          '401': COMMON_ERRORS['401'],
          '403': envelope('Not the chosen account, a session that is not fresh, or a missing CSRF header'),
          '404': envelope('ownership_transfer_not_found'),
          '409': envelope('ownership_transfer_expired, ownership_transfer_used, ownership_transfer_cancelled or ownership_transfer_stale'),
          '422': envelope('Malformed token'),
        },
      },
    },
  };
}
