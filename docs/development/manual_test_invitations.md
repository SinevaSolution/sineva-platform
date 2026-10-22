---
title: "Manual test: invitations, roles, ownership and sign-in methods"
category: "development"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "manual-test", "invitations", "members", "ownership", "sign-in"]
summary: "Step-by-step guide to test inviting people by hand on the dev server (port 3001) with Mailpit, using two browsers at once, and what each step should show."
related_docs:
  - "../api-spec/members_and_invitations_endpoints.md"
  - "../decisions/0029-members-invitations-and-ownership-transfer.md"
  - "../decisions/0041-oauth-reauthentication-and-account-linking.md"
---

# Manual test: invitations, roles, ownership and sign-in methods

About 20 minutes. The same journeys run automatically with `npm --workspace=@sineva/web run test:journeys`; this guide is for looking at it yourself.

## Before you start

1. Dev server: `cd apps/web && npx next dev --hostname 127.0.0.1 --port 3001`.
2. Mailpit is where every email lands: open <http://127.0.0.1:8025>. Keep it in a third tab.
3. Always use `127.0.0.1:3001` in the address bar, never `localhost`. Cookies belong to one host, so mixing the two looks like "I got signed out".
4. Email links start with the address in `NEXT_PUBLIC_APP_URL`. If a link in Mailpit points at a different host or port than the one you use, keep the path (everything from `/invite/...`) and paste it after `http://127.0.0.1:3001`.
5. Test accounts (password in `CHECKPOINT.md`, section 2):
   - `owner@acme.com` owns Acme Corp. This is **the owner**.
   - `admin@sineva.id` owns Sineva HQ. This is **the existing user**.
6. The two-browser trick: **Browser A** is a normal window, signed in as the owner. **Browser B** is a private (incognito) window, which has its own cookies, so it can be signed out or signed in as someone else at the same time. If you need a third person, open a second private window in a different browser (two private windows of the same browser share cookies).
7. Use an address you can invent for new people, for example `nia.test@example.org`. Mailpit catches everything, nothing is really sent.

## 1. Invite a new person (Browser A, then Browser B)

**A.** Sign in as the owner, open **Settings, Members** (`/w/acme-corp/settings/members`). You see the people table with Name, Role, Specialist access and Last active, and the **Invite member** button.

1. Press **Invite member**. Type `nia.test@example.org`. Leave the role on **Member**. Under **Specialist access** choose **Selected specialists** and tick two (for example SinoFinance and SinoSales). Press **Invite member**.
   - Shows: a green note "We emailed nia.test@example.org...", a link field with a copy button (the button has a tooltip), a "Invitation created" toast. The address appears under **Pending invitations** with the role and an expiry date.
2. Open Mailpit. There is one email "... invited you to Acme Corp on Sineva". Its button or link is the same address as the link field in step 1.

**B.** In the private window, open that link.

3. Shows: "Workspace invitation", "You have been invited to Acme Corp as Member...", and two buttons: **Sign in** and **Create account**.
4. Press **Create account**. The address bar is `/sign-up?next=%2Finvite%2F...` (the way back is kept). Fill name, the same email, a password of 12 or more characters, tick the consent box, press **Create account**.
   - Shows: "Check your email" style confirmation naming the address.
5. Mailpit: a "Verify your email for Sineva" message. Open its link in Browser B.
   - Shows: the address has `next=%2Finvite...` in it. After the page says the email is verified, press **Continue**.
6. You are on `/sign-in?next=...invite...`. Sign in with the new email and password.
   - Shows: you land on the invitation page again, now with a **Join workspace** button (no sign-in buttons).
7. Press **Join workspace**.
   - Shows: you land in `/w/acme-corp`. Open **Settings, Members**: you see a short list (names and roles only, no emails, no "Last active"), because a member does not see contact details.

**A.** Refresh the Members page.

8. Shows: Nia in the table with role **Member** and "2 selected". Click her row: the drawer shows the two specialists ticked and the rest not.

## 2. An existing person accepts while signed in (Browser A, then B)

**A.** Invite `admin@sineva.id` as **Member**, all specialists. Mailpit has the email.

**B.** Sign out if needed, sign in as `admin@sineva.id`. Open the link from Mailpit.

1. Shows: the invitation with **Join workspace**. Press it, you land in `/w/acme-corp`.

## 3. Switch workspace (Browser B, signed in as `admin@sineva.id`)

1. Type a few words in the message box on the Acme Corp home page (do not send).
2. Press the workspace name at the top of the sidebar (tooltip: "Switch workspace").
   - Shows: both workspaces, each with its first letter, name and a role chip: Sineva HQ **Owner**, Acme Corp **Member**. A check marks the current one.
3. Pick **Sineva HQ**.
   - Shows: the address changes to `/w/sineva-hq` and the message box is empty. Switch back to Acme Corp: it is empty there too (nothing carries over).

## 4. Wrong account signed in (Browser B)

**A.** Invite a third address, `wrong.test@example.org`. Copy the link from the panel.

**B.** Still signed in as `admin@sineva.id`, open that link.

1. Shows: "This link was sent to a different account. Switch to the account it was meant for." and a **Switch account** button, no **Join workspace**.
2. Press **Switch account**. You are signed out and sent to `/sign-in?next=...invite...`.

## 5. Links that no longer work (Browser B, signed out)

1. Open the link from step 1 again (already used). Shows: "This invitation was already used."
2. Browser A: invite `late.test@example.org`. In **Pending invitations** use **Revoke invitation**, confirm. Shows: toast "Invitation revoked", the row is gone. Open its link in B: "This invitation was cancelled. Ask the owner to send a new one."
3. Expired: invitations last 7 days, so you cannot wait for it. Expiry is covered by the automatic run; to see it by hand, ask for the SQL (`update platform.workspace_invitations set expires_at = now() - interval '1 day' where email = '...'`) and open the link: "This invitation has expired. Ask the owner to send a new one." The row shows an **Expired** badge and **Resend invitation** still works.
4. Resend: **Resend invitation** on a pending row. Shows: a toast, a new email in Mailpit, a new link field. The old link now shows "page not found".

## 6. Roles and removal (Browser A)

1. Click Nia's row, change **Role** to **Viewer**, **Save changes**. Shows: "Changes saved." and the badge turns to Viewer.
2. Remove someone: press the bin icon on a row (tooltip "Remove ..."), then **Remove member** in the dialog.
   - If you signed in less than 15 minutes ago: it just happens, with a toast "... was removed."
   - If longer ago (or wait 15 minutes): a dialog "Confirm it's you" opens first. Type your password, **Confirm**, and the removal continues by itself.
3. In the window of the removed person, reload any `/w/acme-corp` page. Shows: page not found. Access is gone on the very next request.

## 7. Ownership transfer (Browser A, then B)

Needs an admin. In Browser A, change one member to **Admin** (drawer, Role).

1. **Transfer ownership**, pick the admin, **Send ownership invitation**. Shows: a toast "Ownership invitation sent to ...", and the section now says the invitation is pending with **Cancel ownership transfer**.
2. Mailpit has "... wants to hand you Acme Corp on Sineva". In Browser B, signed in as that admin, open the link. Shows: "You have been asked to own Acme Corp" and **Accept ownership**.
3. If their session is older than 15 minutes, pressing **Accept ownership** opens "Confirm it's you". After confirming you are back on the same page with "Confirmed. Press the button below to finish." Press **Accept ownership** again on purpose.
4. Shows: you land in `/w/acme-corp`. Members shows the new owner as **Owner** and the previous owner as **Admin**.

## 8. People who sign in with Google or GitHub only

Needs Google or GitHub credentials in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) and the callback `http://127.0.0.1:3001/api/v1/auth/oauth/<google|github>/callback` registered with the provider. Without them the Connect buttons are disabled and a tooltip says why.

1. Sign out. On the sign-in page press **Google** (this creates a person with no password).
2. **Settings, Profile, Sign-in methods** (`?tab=sign_in`). Shows: Google "Linked" with **Disconnect** greyed out; hover it: "Add another way to sign in first". GitHub "Not linked" with **Connect GitHub**. The password row says "Not set" with **Set a password**.
3. **Connect GitHub**. At GitHub press Cancel: you come back with "You cancelled, so nothing was changed." Try again and approve: toast "Connected. You can use it to sign in from now on." and GitHub shows Linked.
4. Try to connect the same GitHub account to a second Sineva person: "That account is already connected to another Sineva user."
5. Re-confirm without a password: if this person is an admin of a workspace with members, remove one after waiting 15 minutes. The dialog offers **Continue with Google** and no password field. After Google you are back on Members and the removal finishes.
6. **Disconnect** on GitHub: confirm. Toast "GitHub was disconnected."
7. **Set a password**: toast "We sent a link to ...". Mailpit has "Reset your Sineva password". Choose a password. All sessions end, sign in again with email and password. Shows: Sign-in methods now says the password is set, **Disconnect** is enabled.

## 9. Looking at the emails (Mailpit)

Every email the app sends lands in Mailpit at <http://127.0.0.1:8025>: invitations, verify email, password reset, ownership transfer and its notices.

1. Open a message. The **HTML** tab shows the designed email; the **Text** tab shows the plain version (it has the same link); **HTML Check** lists client support.
2. What the invitation should show: the Sineva name on a soft teal band with Sino waving, "Budi invited you to join Acme Corporation on Sineva", one line on what Sineva is, "Your role: Member" with what that means, a big **Join Acme Corporation** button, the link as text under it, "This invitation works for 7 days.", a note that it only works for the invited address, "If you were not expecting this, you can ignore this email.", and a quiet footer ("Sineva · sineva.id" and why you got the email).
3. Sino's picture comes from `<app address>/email/sino-wave.png`. If the picture is missing in Mailpit, the address in `NEXT_PUBLIC_APP_URL` is not reachable from the browser; the alt text "Sino waving hello" shows instead and the layout still holds.
4. Dark mode: switch your system to dark and reload the message tab; the card, text and button stay readable.
5. Phone width: Mailpit has a phone/tablet/desktop switch above the HTML tab. The card shrinks and the button stays full size.
6. Language: an invitation is written in the workspace's language (Settings, Preferences, workspace language; the seed workspaces are Indonesian). Invite someone, open the message, and compare: Indonesian uses "kamu" and the button says "Gabung ke Acme Corporation". Verify and reset emails follow the language of the account.
7. Check that a name with symbols is safe: invite from a workspace whose name contains `<b>` or `&` (rename it in Business profile). The email shows the characters as typed, never as bold text.

## Things to look for that are not in the steps

- Every icon button shows a tooltip on hover and on keyboard focus.
- Narrow the browser to phone width on the Members page: rows become cards, nothing scrolls sideways.
- Switch the app language to Indonesian in Settings, Preferences, and repeat any step: all the text above is translated.
- No page mentions seats or plan limits (they appear only when plans are enforced, later).

## If something looks wrong

Note the step number, the address in the address bar and the time, then check Mailpit for the email and the dev server console.
