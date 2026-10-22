---
title: "OAuth Re-confirmation and Account Linking Intents"
category: "decisions"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "adr", "auth", "oauth", "fresh-session", "account-linking"]
summary: "The OAuth round trip carries an intent (sign_in, link, reauth) and, for the last two, the id of the signed-in user in its signed state. Re-confirming through a linked provider marks the existing session fresh; linking adds a provider to the signed-in user. Neither opens a new session."
related_docs:
  - "README.md"
  - "0017-authentication-mechanism.md"
  - "0029-members-invitations-and-ownership-transfer.md"
  - "../api-spec/members_and_invitations_endpoints.md"
adr_id: "0041"
decision_status: "accepted"
supersedes: []
---

# 0041 OAuth Re-confirmation and Account Linking Intents

Accepted on the Founder's delegation, using the plan's recommended option (WP-M1-29, FR-AUTH-01c, FR-AUTH-06).

## Context

Removing a member, starting or accepting an ownership transfer, and linking or unlinking a sign-in method need a fresh session (signed in within 15 minutes, FR-AUTH-06). The only way to refresh was `POST /api/v1/auth/reauthenticate`, which takes a password. People who signed in with Google or GitHub only have no password, so these actions were a dead end for them. The OAuth callback always signed the browser in again (new session, state that carried no purpose), and there was no way to start a link flow for a signed-in person.

## Decision

1. **Intent in the state.** The signed OAuth state cookie gains `intent` (`sign_in` default, `link`, `reauth`) and, for the last two, `userId`. A cookie without the field is a sign-in. The start route `GET /api/v1/auth/oauth/{provider}?intent=...&return_to=...` requires a session for `link` and `reauth` (without one it redirects to `/sign-in`) and refuses a provider that has no real credentials on this deployment (redirect with `oauth=not_configured`).
2. **Binding.** At the callback the browser's current session must belong to the `userId` in the state; otherwise nothing is linked or refreshed (`oauth=mismatch`). A state cookie planted for someone else is therefore useless.
3. **Re-auth.** The provider account the browser just proved must already be linked to that same user (`oauth_account_mismatch` otherwise). On success the existing session gets a new 15-minute window (`JwtAuthService.markFresh`, shared with the password path, scoped to the user's own live session) and the session cookie is re-issued. No new session is created. Audit: `user.reauthenticated` with provider and method, no address.
4. **Link.** Uses `LinkAccountUseCase` unchanged in spirit: it needs a fresh session, refuses a provider account that belongs to another user (`account_in_use`) and now also a second account of a provider the user already linked (`provider_already_linked`). Linking does not compare the provider email with the account email: the person proved both accounts in one browser while signed in, which is stronger than an address match, and a work address often differs from a personal Google login.
5. **Outcome as a redirect code.** Because the person is mid-redirect, every outcome of `link` and `reauth` is a redirect to `return_to` with `oauth=<code>`: `linked`, `reauthenticated`, `mismatch`, `account_in_use`, `provider_already_linked`, `fresh_required`, `not_configured`, `cancelled` (the consent screen was dismissed), `failed`. The pages turn the code into plain copy and strip it from the address bar.
6. **Distinguishable stale-session error.** A stale session is still 403 `forbidden`, with detail code `fresh_session_required` (`FreshSessionRequiredError`). The client opens the "Confirm it's you" dialog only for that code, never for an ordinary role refusal.
7. **Resuming the action.** The dialog offers the password (when the account has one) and "Continue with Google/GitHub" for each linked, configured provider. The action that was waiting survives the provider trip in `sessionStorage` (tab-scoped, expires after 15 minutes, holds ids and labels only) and runs on return, except accepting an ownership transfer, which only shows "Confirmed" and waits for one more deliberate click.
8. **Adding a first password.** "Set a password" sends the existing password-reset email. `resetPassword` now creates the credential account when none exists (it used `updateMany`, which silently did nothing for an OAuth-only user while still consuming the link and revoking every session).
9. **Browser-test identity provider.** `OAUTH_TEST_IDP_URL` points both providers' authorize, token and profile endpoints at a fake. In production it also needs `OAUTH_TEST_IDP_ALLOW=true`, the same two-flag pattern as `ENTITLEMENTS_MODE=enforced`, so one stray variable cannot redirect real sign-ins.
10. **Open-redirect hardening.** `sanitizeNextRedirect` also rejects backslashes and control characters (`/\host` is `//host` to a browser), and lives in the domain layer so the proxy and the application layer share one rule.

## Consequences

- No migration. One new audit action (`user.reauthenticated`); the callback route policy lists it.
- The OAuth start route is no longer purely public: its `link` and `reauth` modes read the session.
- A provider that is not configured is hidden from the re-confirm dialog and disabled (with a reason) on the sign-in methods page; the plain sign-in buttons keep their current behaviour.

## Alternatives considered

1. **A separate callback route for link and re-auth.** Needs a second redirect URI registered with each provider. One callback with the intent in the signed state avoids that.
2. **Re-auth by signing in again through the provider (new session).** It would drop the workspace-pinned state of the current session and hide the "same person" check; extending the existing session is smaller and keeps the audit trail on one session id.
3. **Executing a waiting ownership acceptance automatically on return.** Rejected: taking over a workspace should always be a deliberate click.
4. **Matching the provider email to the account email when linking.** Rejected for the reason in decision 4; the pre-hijacking defence stays on the sign-in path (`OAuthSignInUseCase`), where it belongs.
