---
title: "Members, Invitations and Ownership Transfer Endpoints"
category: "api-spec"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "api-spec", "members", "invitations", "roles", "ownership"]
summary: "Member list and management, specialist scope, invitations (create, resend, revoke, preview, accept), leaving, and ownership transfer, with the exact wire shapes, error codes and the sign-up-by-invitation flow."
related_docs:
  - "overview.md"
  - "swagger_and_openapi.md"
  - "../decisions/0029-members-invitations-and-ownership-transfer.md"
  - "../decisions/0019-role-and-permission-model.md"
---

# Members, invitations and ownership transfer endpoints

Source: `apps/web/src/app/api/v1/workspaces/[workspace_id]/{members,invitations,transfer-ownership}/**`, `app/api/v1/invitations/**`, `app/api/v1/ownership-transfers/**`, `application/use-cases/members/`, `application/dtos/member_dto.ts`. Wire types: `src/shared/members_view.ts`. Decision: [ADR-0029](../decisions/0029-members-invitations-and-ownership-transfer.md). Envelope and errors: [overview](overview.md). Identity is always the session; no route takes a user id. A workspace the caller does not belong to is a 404, never a 403.

Bodies are `strict` (unknown keys are 422). Mutating routes need the CSRF header `x-sineva-action` when the session is a cookie. Errors carry a stable machine code in `errors[0].code`; map copy from it, never from `message`. State conflicts use 409 (the envelope has no 410).

## Roles and limits

| Action | Owner | Admin | Member, Viewer |
| :--- | :--- | :--- | :--- |
| Invite as admin | yes | no | no |
| Invite as member or viewer | yes | yes | no |
| Invite as owner | never (use ownership transfer) | never | never |
| Change a role | any of admin, member, viewer | member to viewer and back only | no |
| Remove | admin, member, viewer | member, viewer | no |
| Set specialist scope | yes | yes | no |
| Transfer ownership | yes | no | no |
| Leave | no (409 `last_owner`) | yes | yes |

Nobody changes their own role. The owner cannot be removed, demoted or leave: 409 `last_owner`. Specialist scope applies to role `member` only (422 `scope_not_applicable` otherwise). Leaving the `member` role resets the scope to `all`. Removing a member and starting or accepting an ownership transfer need a fresh session (signed in within 15 minutes, FR-AUTH-06): a stale one is 403 `forbidden` with detail code `fresh_session_required` (never shown as "you cannot do this"). The client opens the "Confirm it's you" dialog and retries after one of two ways of re-confirming:

- **Password:** `POST /api/v1/auth/reauthenticate` with `{ "password": string }` (401 for a wrong password).
- **Google or GitHub** (people who have no password, [ADR-0041](../decisions/0041-oauth-reauthentication-and-account-linking.md)): navigate to `GET /api/v1/auth/oauth/{provider}?intent=reauth&return_to=<same page>`. The provider account must be linked to the signed-in user; the existing session is marked fresh (no new session) and the browser lands on `return_to` with `oauth=reauthenticated` (or `oauth=mismatch`, `cancelled`, `failed`). The page finishes the waiting action on return, except accepting an ownership transfer, which waits for one more deliberate click.

## Members

| Method | Path | Permission | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/{workspace_id}/members` | `member.view` | 200 `MemberView[]` | 401, 404 |
| `GET` | `.../members/{member_id}` | `member.view` | 200 `MemberView` | 401, 404, 422 |
| `PATCH` | `.../members/{member_id}` | `member.update_access` (finer rules in the use case) | 200 `MemberView` | 401, 403, 404, 409, 422 |
| `PUT` | `.../members/{member_id}/specialists` | `member.update_access` | 200 `MemberView` | 401, 403, 404, 422 |
| `DELETE` | `.../members/{member_id}` | `member.remove`, fresh session | 200 `data: null` | 401, 403, 404, 409, 422 |
| `DELETE` | `.../members/me` | `workspace.view` (any role) | 200 `data: null` | 401, 404, 409 |

```ts
interface MemberView {
  id: string;                       // member id, used in the paths above
  display_name: string;             // preferred name, else full name
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  job_title: string | null;
  department: string | null;
  status: 'active';                 // removed people disappear from the list
  is_you: boolean;
  joined_at: string;                // ISO
  // Present only for owner and admin (member.view_contact). Absent, not null, for others.
  email?: string;
  phone_number?: string | null;
  last_active_at?: string | null;   // latest sign-in, not the last request
  specialist_scope?: 'all' | 'selected';
  specialist_slugs?: string[];      // empty unless scope is selected
}
```

`PATCH` body (at least one key): `{ "role"?: "admin"|"member"|"viewer", "specialist_scope"?: "all"|"selected", "specialist_slugs"?: string[] }`. `specialist_slugs` goes only with `specialist_scope: "selected"`; `selected` with no slugs and no existing allowlist is 422 `allowlist_required`. `PUT` body: `{ "specialist_slugs": string[] }` (at least one), replaces the allowlist and sets scope `selected`. Slugs are validated against the static manifest (`src/shared/specialists/manifest.ts`); an unknown one is 422 `unknown_specialist`.

Removal deletes the membership: the person loses the workspace on their very next request (memberships are resolved from the database on every request), sessions pinned to the workspace are revoked, authored content stays attributed to a "Former member", and the MCP grant hook is called (a documented no-op until M3).

Role-change errors: 403 `forbidden` (limit above), 409 `last_owner` (the owner demoting themselves), 422 for an `owner` role (not an accepted value).

## Invitations (workspace side)

| Method | Path | Permission | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/{workspace_id}/invitations` | `member.invite` | 200 `InvitationView[]` | 401, 403, 404 |
| `POST` | `.../invitations` | `member.invite` | 201 `InvitationCreatedView` | 401, 403, 404, 409, 422 |
| `POST` | `.../invitations/{invitation_id}/resend` | `member.invite` | 200 `InvitationCreatedView` | 401, 403, 404, 422 |
| `DELETE` | `.../invitations/{invitation_id}` | `member.invite` | 200 `data: null` | 401, 403, 404, 422 |

```ts
interface InvitationView {
  id: string;
  email: string;                    // lowercase
  role: 'admin' | 'member' | 'viewer';
  specialist_scope: 'all' | 'selected';
  specialist_slugs: string[];
  state: 'pending' | 'expired';     // expired ones stay listed so they can be resent
  expires_at: string;
  last_sent_at: string;
  created_at: string;
}
interface InvitationCreatedView {
  invitation: InvitationView;
  invite_url: string;               // https://{app}/invite/{token}; ONLY here and on resend
  replaced: boolean;                // an earlier pending invitation for the address was replaced
  email_sent: boolean;              // false: mail transport failed, invitation and link still valid
}
```

`POST` body: `{ "email": string, "role": "admin"|"member"|"viewer", "specialist_scope"?: "all"|"selected", "specialist_slugs"?: string[] }`. 409 `already_member` is the "Already in this workspace" case. Re-inviting a pending address (or resending) gives a new token and a fresh 7 days, and the old link stops working. The entitlement `members.max` is checked on create (open mode in M1 to M5). `invite_url` is for the inviter to copy into WhatsApp; the list never carries a token.

## Invitations (link side)

| Method | Path | Auth | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/invitations/{token}` | none (session optional) | 200 `InvitationPreviewView` | 404, 422 |
| `POST` | `/api/v1/invitations/{token}/accept` | session, verified email | 200 `InvitationAcceptedView` | 401, 403, 404, 409, 422 |

```ts
interface InvitationPreviewView {
  state: 'pending' | 'expired' | 'used' | 'revoked';
  workspace_name: string;
  inviter_first_name: string | null;
  role: 'admin' | 'member' | 'viewer';
  expires_at: string;
  email_matches_session: boolean | null;  // null when signed out; never reveals the address
}
interface InvitationAcceptedView {
  workspace: { id: string; workspace_slug: string; workspace_name: string };
  role: 'owner' | 'admin' | 'member' | 'viewer';
}
```

The preview never returns an email or an id. A token that was replaced by a newer invite is 404 `invitation_not_found`.

Accept errors: 401 (no session), 403 `invitation_email_mismatch` (signed in as someone else), 403 `email_not_verified`, 404 `invitation_not_found`, 409 `invitation_expired`, `invitation_used`, `invitation_revoked`, `already_member`. The first expiry notice of an invitation is audited as `invitation.expired`.

### Flow for a person who has no account yet (UI contract)

1. They open `/invite/{token}`. The page calls `GET /api/v1/invitations/{token}` (works signed out) and shows the workspace, inviter and role. Page route `/invite/{token}` must be reachable signed out: add it to the public pages of `proxy.ts` (today the proxy redirects unknown signed-out pages to `/sign-in?next=...`).
2. "Create account": send the user to `/sign-up?next=/invite/{token}`. The sign-up form posts `POST /api/v1/auth/sign-up` with the normal body plus `"next": "/invite/{token}"`. `next` accepts only `/invite/{token}` or `/ownership/{token}` (422 otherwise). They must use the invited email address.
3. The verification email link becomes `/verify-email?token=...&next=%2Finvite%2F{token}`. The verify page, after success, sends the user to `/sign-in?next=/invite/{token}`. (Verification creates their provisional "My workspace" as usual.)
4. After sign-in, redirect to `next`. The invite page calls the preview again (`email_matches_session`), then `POST /api/v1/invitations/{token}/accept`, and redirects to `/w/{workspace_slug}`.
5. An existing account: signed-out `/invite/{token}` shows "Sign in" with `?next=/invite/{token}`; the sign-in form must honor `next`.

`email_matches_session: false` means the signed-in account is not the invited one: offer "Sign out and use the invited email".

## Ownership transfer

| Method | Path | Auth | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/{workspace_id}/transfer-ownership` | owner (`workspace.transfer_ownership`) | 200 `OwnershipTransferView` or `data: null` | 401, 403, 404 |
| `POST` | `.../transfer-ownership` | owner, fresh session | 201 `OwnershipTransferView` | 401, 403, 404, 422, 503 |
| `DELETE` | `.../transfer-ownership` | owner | 200 `data: null` | 401, 403, 404 |
| `GET` | `/api/v1/ownership-transfers/{token}` | none (session optional) | 200 `OwnershipTransferPreviewView` | 404, 422 |
| `POST` | `/api/v1/ownership-transfers/{token}/accept` | the chosen admin, fresh session | 200 `OwnershipTransferAcceptedView` | 401, 403, 404, 409, 422 |

```ts
interface OwnershipTransferView {
  id: string;
  state: 'pending' | 'expired';
  expires_at: string;
  created_at: string;
  target: { member_id: string | null; display_name: string };
}
interface OwnershipTransferPreviewView {
  state: 'pending' | 'expired' | 'used' | 'cancelled';
  workspace_name: string;
  from_first_name: string | null;
  expires_at: string;
  is_target: boolean | null;        // null when signed out
}
interface OwnershipTransferAcceptedView {
  workspace: { id: string; workspace_slug: string; workspace_name: string };
  notices_sent: boolean;            // false: a notice email failed, the transfer is done
}
```

`POST` body: `{ "target_member_id": string }`; the target must be an admin (422 `target_must_be_admin`). The target gets an email link to `/ownership/{token}` (no copy-link path: the token is never returned). A new request replaces an open one. 503 means the email could not be sent and nothing was stored. Nothing changes until the target accepts; then, in one transaction, the owner becomes admin and the target owner. Accept errors: 403 `forbidden` (not the chosen account or not a fresh session), 409 `ownership_transfer_expired`, `_used`, `_cancelled`, `_stale` (a party changed role since the request). Links last 7 days.

## Audit events

`member.invited` (create, replace and resend), `invitation.accepted`, `invitation.revoked`, `invitation.expired`, `member.role_changed`, `member.specialist_access_changed`, `member.removed`, `member.left`, `workspace.ownership_transfer_requested`, `workspace.ownership_transfer_cancelled`, `workspace.ownership_transferred`. The last two transfer events beyond `workspace.ownership_transferred` are additions to the PRD list (ADR-0029). Rows hold ids, roles and counts, never an address or a token.

## Related

[ADR-0029](../decisions/0029-members-invitations-and-ownership-transfer.md), [overview](overview.md), [swagger and OpenAPI](swagger_and_openapi.md).
