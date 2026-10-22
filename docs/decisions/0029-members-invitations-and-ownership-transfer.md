---
title: "Members, Invitations and Ownership Transfer"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-22"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "rbac", "invitations", "members", "ownership"]
summary: "Invitation links are 256-bit random, stored as SHA-256, valid 7 days, bound to the verified account with the matching email, and re-inviting replaces the pending row. Ownership moves only through an owner-started, target-confirmed transfer that swaps roles in one transaction."
related_docs:
  - "README.md"
  - "0018-workspace-tenancy-and-public-contract.md"
  - "0019-role-and-permission-model.md"
  - "../../docs/implementation-plan/M1-chat-core.md"
adr_id: "0029"
decision_status: "accepted"
supersedes: []
---

# 0029 Members, Invitations and Ownership Transfer

Accepted on the Founder's delegation, using the implementation plan's defaults (WP-M1-28, PRD: Accounts, Workspaces & Roles, FR-AUTH-14 to FR-AUTH-21).

## Context

ADR-0019 fixed four static roles and a permission registry. It did not say how a person gets into a workspace, how a role changes safely, or how the single owner is replaced. The PRD asks for a WhatsApp-friendly link that must still be useless to anyone but the invitee, and for a workspace that is never orphaned. The repo uses custom JWT auth (ADR-0017), so Better Auth's organization plugin, which the PRD recommends, is not available.

## Decision

1. **Token.** 32 bytes from `crypto.randomBytes`, base64url. Only the SHA-256 hex digest is stored (`workspace_invitations.token_hash`, unique). A lookup is by digest, followed by a `timingSafeEqual` of the stored and computed digests. The plain token exists only in the emailed link and in the one create or resend response that returns `invite_url` (so the inviter can copy it into WhatsApp). It is never logged, audited or listed.
2. **Expiry.** 7 days from creation or resend, checked against an injected clock on every use.
3. **Binding.** Accepting needs a session whose user has a verified email equal (case-insensitive) to the invitation email. A forwarded link opened by another account is refused with 403 `invitation_email_mismatch`. The public preview never returns any email.
4. **One pending row per address.** A partial unique index on `(workspace_id, email)` where the row is neither accepted nor revoked. Re-inviting or resending updates that row in place with a new token digest, role, scope and expiry, so the old link dies at once.
5. **Roles.** `owner` is never invitable. The owner invites `admin`, `member` or `viewer`; an admin invites `member` or `viewer`. Admins change or remove only members and viewers. Only the owner promotes or demotes admins. Nobody sets `owner` through a role change.
6. **Scope.** `specialist_scope` applies to role `member` only. `selected` needs a non-empty allowlist of slugs from the static manifest (`src/shared/specialists/manifest.ts`). Leaving the `member` role resets scope to `all` and clears the allowlist.
7. **Removal and leaving.** Deleting the membership row is the access cut: every request resolves memberships from the database, so the next request to that workspace is a 404. Sessions whose `active_workspace_id` is that workspace are also revoked. Content stays attached to the user id and is shown as "Former member". The MCP grant revocation hook is a port with a no-op adapter until M3. The owner cannot leave or be removed (409 `last_owner`).
8. **Ownership transfer.** A new table `ownership_transfers`. The owner names an existing admin (fresh session). The target gets an emailed link `/ownership/{token}` (same token rules, 7 days, one pending per workspace). Accepting needs the target's own fresh session. In one transaction, holding a row lock on the workspace, the old owner becomes admin, the target becomes owner, `workspaces.owner_user_id` follows, and the transfer is closed. If either side no longer holds its role, the transfer fails with 409 and nothing changes. Both parties get an email notice.
9. **Concurrency.** Role changes, removal, leaving and transfers lock the workspace row (`SELECT ... FOR UPDATE`) first, so two of them serialize. The one-owner partial unique index remains the last line of defense.

## Consequences

- Two new tables or columns need a migration (`20261022140000_members_invitations_ownership_transfer`).
- The accept and transfer-accept routes are global (`/api/v1/invitations/{token}/...`, `/api/v1/ownership-transfers/{token}/...`) because the client holds only the token; this extends the global-path list of D-M0-1.
- Preview routes are public by design; the 256-bit token is the only secret, so they return no personal data beyond the inviter's first name.
- Audit adds `workspace.ownership_transfer_requested` and `workspace.ownership_transfer_cancelled` to the PRD list so every state change of a transfer is evidenced.
- Rate limiting of preview and accept is not added here; the token space makes guessing infeasible, and the shared limiter work covers abuse.

## Alternatives considered

1. **Better Auth organization plugin.** Not applicable: custom JWT auth, and a second auth surface would violate ADR-0017.
2. **Store invitations with a new row per re-invite and revoke the old one.** More audit rows but a pending list that needs filtering; the in-place replace keeps one row and the unique index trivial.
3. **Deferred unique index for the owner swap.** Postgres partial unique indexes cannot be deferred; demoting before promoting inside one transaction gives the same atomicity.
4. **Ownership change by plain role patch.** Rejected: it would skip the target's consent and allow an orphaned or doubly-owned workspace.
