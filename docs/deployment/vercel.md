---
title: "Deploying the Platform on Vercel"
category: "deployment"
status: "active"
version: "1.0.0"
last_updated: "2026-10-23"
owner: "Sineva Engineering"
tags: ["sineva", "deployment", "vercel", "serverless", "cron", "migrations", "runbook"]
summary: "Step-by-step guide for the Founder: external services to create first, the Vercel project settings, every environment variable for Production and Preview, how migrations run during the build, cron, the domain, OAuth redirect URLs, a post-deploy smoke checklist and rollback."
related_docs:
  - "environment_variables.md"
  - "connections_runbook.md"
  - "docker_compose_topology.md"
  - "../decisions/0047-hosting-on-vercel.md"
  - "../engineering/database_migrations_workflow.md"
---

# Deploying the Platform on Vercel

Decision record: [ADR-0047](../decisions/0047-hosting-on-vercel.md). The repository is already prepared (`apps/web/vercel.json`, `apps/web/scripts/vercel_build.mjs`, `engines`). You create the Vercel project and the external services; nothing here needs the `vercel` CLI. Docker Compose stays the self-hosted option and is unchanged ([topology](docker_compose_topology.md)).

## 0. Gotchas first

1. **Plan: Pro.** Both cron jobs run every minute. Hobby allows a cron only once per day and rejects the deployment otherwise ([Vercel docs](https://vercel.com/docs/cron-jobs/usage-and-pricing)). On Hobby, change the two `schedule` values in `apps/web/vercel.json` to a daily expression (for example `0 3 * * *`): Inbox items then expire up to a day late, and connection tokens are refreshed and probed once a day, which breaks connections whose tokens last an hour. Use Pro, or an external scheduler that calls the same routes with `Authorization: Bearer $CRON_SECRET` every minute and a Hobby-valid `vercel.json`. Function duration: the config assumes the Hobby ceiling of 300 s, valid on both plans ([duration limits](https://vercel.com/docs/functions/configuring-functions/duration)).
2. **Production deploys migrate the production database.** Merging to the production branch runs `prisma migrate deploy` before `next build` (Founder decision, ADR-0047). A migration must be backward compatible with the release that is still serving traffic ([section 7](#7-migrations-during-the-build)).
3. **Preview deployments run in production mode too** (`NODE_ENV=production`, set by `next build`), so a Preview needs the full set of non-development values, pointing at separate staging services. It must never share the production database, Redis prefix or bucket.
4. **OAuth sign-in does not work on per-deployment Preview URLs.** Google and GitHub accept only exact redirect URIs. Test sign-in on Production or on one fixed staging domain.
5. **`INTERNAL_CONTEXT_SIGNING_KEY` is a multi-line PEM.** Paste it with real line breaks in the Vercel text box. A single line with literal `\n` characters fails the key check at the first chat call, not at build.
6. **The Node patch level is Vercel's.** `engines` can only say `24.x`. The repository guard (CVE-2026-111497) enforces the major on Vercel and prints a warning for an older patch. Read the build log line `Node 24.x.y` after every first deploy; the baseline is `24.22.1` (`.nvmrc`).
7. **`DATABASE_URL` must be the pooled URL, `DIRECT_DATABASE_URL` the direct one.** A pooled URL cannot take Prisma's advisory lock; production builds fail on purpose when only a pooled URL is available.
8. **No emails without SMTP.** With `EMAIL_SERVER_HOST` unset the app uses a sender that sends nothing (sign-up verification, password reset and invitations never arrive). The build prints a warning.
9. **Storage uploads go straight from the browser to the bucket.** Without the CORS rule in section 2.3, avatar and Library uploads fail in the browser.
10. **The CSP is report-only today.** When it is enforced, `connect-src` must allow the storage public endpoint.

## 1. What runs where

| Part | Where | Notes |
| :--- | :--- | :--- |
| Web app and API | Vercel (Next.js, Node 24 functions) | one project, Root Directory `apps/web` |
| Postgres 17 | Neon recommended (any Postgres with a direct and a pooled endpoint) | schemas `platform` (this app) and `sineva_ai` (the AI engine) in one database |
| Redis | Upstash recommended | TLS, `rediss://` |
| Object storage | Cloudflare R2 recommended | S3 API, presigned browser uploads |
| SMTP | any provider (Resend, Postmark, SES, Brevo) | port 465 sets `secure` automatically |
| `sineva-ai` | outside Vercel, on its own HTTPS host | owned by the AI team; reachable only with `X-Internal-Api-Key` and a signed context |
| Qdrant | used by `sineva-ai` only | not needed by this app |

## 2. Create the external services first

### 2.1 Postgres (Neon)

1. Create a project (region closest to Vercel functions and to `sineva-ai`; Singapore for Indonesian users) and a database `sineva_platform`.
2. Create three roles with passwords from a password manager: `sineva_migrator` (owns the tables, runs migrations), `sineva_app` (the application), `sineva_vault` (the credential vault only, [ADR-0036](../decisions/0036-credential-vault-kms-and-key-hierarchy.md)). Only the migrator needs `CREATE` on the database.
3. As a superuser, once:

```sql
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION sineva_migrator;
GRANT USAGE ON SCHEMA platform TO sineva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sineva_migrator IN SCHEMA platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sineva_app;
```

4. Copy two connection strings per role from the Neon console: the **direct** one (host without `-pooler`) for `sineva_migrator` and the **pooled** one (host with `-pooler`) for `sineva_app` and `sineva_vault`. Keep `sslmode=require`. Do not add `?schema=` to the runtime URLs; the script adds `schema=platform` for migrations.
5. `sineva-ai` needs its own role on the `sineva_ai` schema of the same database; that is its team's step.

The vault role script runs after the first deploy (section 8, step 6).

### 2.2 Redis (Upstash)

Create a database in the same region. Use the TLS endpoint as `REDIS_URL=rediss://default:<password>@<host>:6379` (ioredis switches to TLS on the `rediss://` scheme). Use a separate database or a distinct `REDIS_KEY_PREFIX` for staging. There is no in-memory fallback: if Redis is down, rate limits and health fail typed.

### 2.3 Object storage (Cloudflare R2)

1. Create a bucket (for example `sineva-assets`) and an API token with Object Read and Write on it. Note the Account ID.
2. `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` are both `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Presigned URLs only work on this S3 API domain, not on a custom domain ([R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)). `S3_REGION=auto`. Path-style requests work, so keep `S3_FORCE_PATH_STYLE=true`.
3. CORS: bucket Settings, CORS Policy, JSON tab ([R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)). Use the exact app origin, no trailing slash:

```json
[
  {
    "AllowedOrigins": ["https://sineva.id"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The browser's `Content-Type` must equal the one that was signed, or the upload answers 403. Add a staging origin only to the staging bucket's policy.

### 2.4 SMTP

Create a sending domain for `sineva.id` (SPF, DKIM, DMARC records at your DNS host), then an SMTP user. Port 465 uses implicit TLS (`secure` is set automatically); port 587 uses STARTTLS.

### 2.5 `sineva-ai`

Host it on a public HTTPS URL (for example `https://ai.sineva.id`). It must accept only requests carrying `X-Internal-Api-Key` equal to `AI_ENGINE_INTERNAL_API_KEY` and a valid signed context, and be able to reach the platform's `/api/internal/v1/...` routes over HTTPS (use the `/api` form: the non-`/api` aliases are redirected to sign-in by the page guard when called without a session cookie). Give it the same key (`INTERNAL_API_KEY` there) and the platform's public signing key.

## 3. Create the Vercel project

1. Add New, Project, import the GitHub repository `SinevaSolution/sineva-platform`.
2. **Root Directory:** `apps/web`. Leave "Include source files outside of the Root Directory in the Build Step" **enabled** (the app imports `../../packages/*`).
3. **Framework Preset:** Next.js (also set in `vercel.json`).
4. **Install Command** and **Build Command:** leave the defaults of the form; `vercel.json` overrides them:
   - Install: `cd ../.. && npm ci` (installs all workspaces from the repository root).
   - Build: `node scripts/vercel_build.mjs` (migrates when allowed, then `npm run build`, which runs `prisma generate` and `next build`).
5. **Node.js Version:** 24.x (the `engines` field already says so).
6. **Production Branch:** `main`. Every other branch is a Preview.
7. Settings, Functions: leave Fluid compute on (the default; the duration limits above assume it).
8. Do not deploy yet: add the environment variables first (section 4).

## 4. Environment variables

Set them in Settings, Environment Variables. Mark every secret as Sensitive. Values apply to new deployments only; redeploy after changing one. Examples show the format only.

**Production** and **Preview** both need a complete set (Preview runs in production mode). "Req." means the build or the app refuses to work without it.

| Variable | Req. | Format (example) | Where to get it | Production | Preview |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | yes | `https://sineva.id` | your domain | production domain, https | the staging domain, or the deployment URL |
| `DATABASE_URL` | yes | `postgresql://sineva_app:<pw>@<host>-pooler.<region>.aws.neon.tech/sineva_platform?sslmode=require` | Neon, pooled, role `sineva_app` | production DB | staging DB |
| `DIRECT_DATABASE_URL` | yes (Production) | `postgresql://sineva_migrator:<pw>@<host>.<region>.aws.neon.tech/sineva_platform?sslmode=require` | Neon, direct, role `sineva_migrator` | production DB | leave unset |
| `PREVIEW_DATABASE_URL` | no | direct URL of a staging DB, same shape | Neon staging branch | leave unset | set to enable preview migrations |
| `DATABASE_POOL_MAX` | no | `5` | start at 5 | `5` | `3` |
| `REDIS_URL` | yes | `rediss://default:<pw>@<host>.upstash.io:6379` | Upstash | production DB | staging DB |
| `REDIS_KEY_PREFIX` | no | `sineva:platform:prod:` | choose | `sineva:platform:prod:` | `sineva:platform:preview:` |
| `S3_ENDPOINT` | yes | `https://<account_id>.r2.cloudflarestorage.com` | R2 | as given | staging bucket account |
| `S3_PUBLIC_ENDPOINT` | yes | same as `S3_ENDPOINT` for R2 | R2 | as given | as given |
| `S3_REGION` | yes for R2 | `auto` | R2 | `auto` | `auto` |
| `S3_ACCESS_KEY_ID` | yes | 32 hex characters | R2 API token | production token | staging token |
| `S3_SECRET_ACCESS_KEY` | yes | 64 hex characters | R2 API token | production token | staging token |
| `S3_BUCKET_NAME` | yes | `sineva-assets` | R2 | production bucket | staging bucket |
| `S3_FORCE_PATH_STYLE` | no | `true` | keep | `true` | `true` |
| `AI_ENGINE_INTERNAL_URL` | yes | `https://ai.sineva.id` | `sineva-ai` team | production engine | staging engine |
| `AI_ENGINE_INTERNAL_API_KEY` | yes | `openssl rand -hex 32` | generate; give it to `sineva-ai` | unique | unique |
| `AI_ENGINE_INTERNAL_API_KEY_NEXT` | no | same form | only during rotation | unset | unset |
| `AI_ENGINE_TIMEOUT_MS` | no | `15000` | keep at or below `55000` on Vercel (routes cap at 60 s) | `15000` | `15000` |
| `AUTH_SECRET` | yes | `openssl rand -base64 48` (at least 32 characters) | generate | unique | unique |
| `INTERNAL_CONTEXT_SIGNING_KEY` | yes | multi-line Ed25519 PKCS#8 PEM (`openssl genpkey -algorithm ed25519`) | generate; give the public key to `sineva-ai` | unique | unique |
| `INTERNAL_CONTEXT_KID` | yes | `k1` | choose; matches the key id registered in `sineva-ai` | `k1` | `k1` |
| `CRON_SECRET` | yes for cron | `openssl rand -hex 32` (at least 16 characters) | generate; Vercel sends it as the bearer | set | not needed (cron runs on Production only) |
| `EMAIL_FROM` | yes for email | `Sineva <no-reply@sineva.id>` | your sending domain | set | set |
| `EMAIL_SERVER_HOST` | yes for email | `smtp.provider.example` | SMTP provider | set | set |
| `EMAIL_SERVER_PORT` | yes for email | `465` | SMTP provider | `465` | `465` |
| `EMAIL_SERVER_USER` | yes for email | provider user | SMTP provider | set | set |
| `EMAIL_SERVER_PASSWORD` | yes for email | provider password | SMTP provider | set | set |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | from Google Cloud | section 6 | set | unset (see gotcha 4) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | for GitHub sign-in | from GitHub | section 6 | set | unset |
| `VAULT_DATABASE_URL` | yes for connections | pooled URL of role `sineva_vault`, must differ from `DATABASE_URL` | Neon | set | set (staging role) |
| `VAULT_LOCAL_KEK` | yes for connections | `prod-2026-1:<base64 of 32 bytes>` (`echo "prod-2026-1:$(openssl rand -base64 32)"`); the id must not contain `dev`, `example`, `changeme` | generate; store a copy in the password manager, losing it loses every stored credential | set | set (different key) |
| `VAULT_LOCAL_KEK_PREVIOUS` | no | same form | only during key rotation ([runbook](connections_runbook.md)) | unset | unset |
| `VAULT_KMS_PROVIDER` | no | `local` | keep `local` until the production KMS is chosen | `local` | `local` |
| `GOOGLE_CONNECT_CLIENT_ID`, `GOOGLE_CONNECT_CLIENT_SECRET` | for Google Calendar and Gmail | OAuth client | section 6 | set | unset |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | for Notion | public integration | section 6 | set | unset |
| `ENTITLEMENTS_MODE` | no | `open` | keep `open` until M6 | `open` | `open` |
| `ENTITLEMENTS_ALLOW_ENFORCED` | no | | never set before M6 | unset | unset |
| `ENABLE_DEV_UI` | no | | never set in Production | unset | unset |
| `OAUTH_TEST_IDP_URL`, `OAUTH_TEST_IDP_ALLOW` | no | | browser-test stack only; never set | unset | unset |
| `NEXT_TELEMETRY_DISABLED` | no | `1` | optional | `1` | `1` |

Not used on Vercel: `NEXT_PUBLIC_API_BASE_URL` (read by the config, not used by the app), `TEST_DATABASE_URL`, `POSTGRES_*`, `S3_*` compose values, `VERCEL_*` (set by Vercel; the build script reads `VERCEL` and `VERCEL_ENV`).

The connection layer variables are optional at boot: without them the app starts and Connections answer `503 vault_unavailable` or list the provider as unavailable. Production requires `VAULT_DATABASE_URL` the first time the vault is used.

## 5. Domain `sineva.id`

1. Settings, Domains, add `sineva.id` (and `www.sineva.id`; Vercel offers a redirect to the apex).
2. At the DNS host: the apex needs the **A** record Vercel shows for the project (the value on the Domains page; `76.76.21.21` is the generic one), a subdomain needs the project's **CNAME**. Remove conflicting A, AAAA or CNAME records for the same name ([Vercel domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)).
3. **Check what `sineva.id` serves today.** If the marketing site (`sineva-compro`) lives on the apex, host the platform on a subdomain (for example `app.sineva.id`) and use that origin everywhere below: `NEXT_PUBLIC_APP_URL`, OAuth redirect URIs, R2 CORS.
4. Set `NEXT_PUBLIC_APP_URL` to the final https origin and redeploy. It builds every emailed link, every OAuth redirect URI and the CSRF origin check.
5. Cookies are host-only; use one origin, not both apex and `www`.

## 6. OAuth redirect URLs to register

Replace `https://sineva.id` with your final origin. The path comes from the code (`NEXT_PUBLIC_APP_URL` plus the path).

| Provider | Console | Redirect URI to register | Variables |
| :--- | :--- | :--- | :--- |
| Google sign-in | Google Cloud, APIs and Services, Credentials, OAuth client (Web) | `https://sineva.id/api/v1/auth/oauth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub sign-in | GitHub, Settings, Developer settings, OAuth Apps | `https://sineva.id/api/v1/auth/oauth/github/callback` (Authorization callback URL) | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Google Calendar and Gmail (Connect) | a separate OAuth client from sign-in (different consent screen and scopes) | `https://sineva.id/api/v1/connections/oauth/callback` | `GOOGLE_CONNECT_CLIENT_ID`, `GOOGLE_CONNECT_CLIENT_SECRET` |
| Notion (Connect) | Notion, My integrations, public integration | `https://sineva.id/api/v1/connections/oauth/callback` | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` |

Also add the origin under "Authorized JavaScript origins" for the Google clients. A Google consent screen in "Testing" status limits sign-in to listed test users; publish it before launch. The provider parameters marked "recalled" in the connection manifests need checking against each provider's documentation before it goes live ([connections runbook](connections_runbook.md), section 6).

### 6.1 Gmail in Connected tools

Gmail uses the same `GOOGLE_CONNECT_CLIENT_ID` and `GOOGLE_CONNECT_CLIENT_SECRET` as Google Calendar, with the same callback above. It does not use the Google sign-in client. Enable the Gmail API in that Google Cloud project and configure the consent screen for these bundles:

- `email_read`: `openid`, `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/gmail.readonly`.
- `email_compose`: the read bundle plus `https://www.googleapis.com/auth/gmail.compose`.

For an external app in Testing, add the accounts that will connect as test users. Google classifies both `gmail.readonly` and `gmail.compose` as restricted scopes. Public use requires restricted-scope verification; storing or transmitting restricted data on servers also requires a security assessment ([Google scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes)). Publishing the consent screen alone does not complete these requirements.

**Implementation boundary:** the provider registry, OAuth connection lifecycle, access bundles, grants and Connected tools UI are implemented. The four Gmail action definitions cover searching, reading, drafting and sending; sending is marked as an irreversible external write. The Tool Gateway (WP-M2-10) and Gmail action execution are not implemented on this branch, so linking an account does not yet let a specialist read or send email. Do not use account linking as evidence that email execution or its approval flow works.

## 7. Migrations during the build

`apps/web/scripts/vercel_build.mjs` is the Build Command. Decision table:

| Build | What happens |
| :--- | :--- |
| Production (`VERCEL_ENV=production`) | migrate with `DIRECT_DATABASE_URL`, then build |
| Preview with `PREVIEW_DATABASE_URL` | migrate that staging database, then build; refuses to run if it is the production database |
| Preview without it | no migration, build only |
| Local, Docker, CI | no migration (the script only acts when `VERCEL=1`) |

Safeguards, all enforced by the script and tested:

- **Direct connection.** `DIRECT_DATABASE_URL`, or `DATABASE_URL` if it is not a pooler URL. `?schema=platform` is added (`_prisma_migrations` lives in `platform`); any other `schema` is refused. The app keeps using the pooled `DATABASE_URL`.
- **Failure stops the deploy.** Exit code non-zero before `next build`: the previous deployment stays live. The log shows migration names and status only. Connection strings, users and passwords are redacted.
- **Destructive gate.** Pending migrations (never already-applied ones) containing `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `TRUNCATE` or a `DELETE FROM` without `WHERE` fail the build unless the migration folder holds `APPROVED_DESTRUCTIVE.md` with a reason of at least 20 characters. An empty database (all migrations pending) is not gated. If the gate blocks you: make the change backward compatible, or add the marker in a reviewed commit.
- **Concurrent builds.** Prisma takes a database advisory lock while it migrates, so two builds cannot apply the same migration twice. The second waits for the lock and fails if it is not released in time (recalling Prisma behavior, not tested here); redeploy it.
- **Production env check.** The production build fails without an https `NEXT_PUBLIC_APP_URL`, and warns about a missing `CRON_SECRET` or `EMAIL_SERVER_HOST`.

### Expand, then contract

The old deployment keeps serving while the new build migrates, and a build that fails after migrating leaves the new schema under the old code. So every migration must work with the release before it:

1. **Expand** (release N): add tables, add nullable columns or columns with defaults, add indexes. Never rename or drop in the same release; write both old and new shapes if data moves.
2. **Switch** (release N+1): code reads and writes the new shape only.
3. **Contract** (release N+2 or later): drop the old column or table, in a migration that carries `APPROVED_DESTRUCTIVE.md` once nothing reads it and a backup exists.

Never edit a migration folder that was already applied; add a new one. Never `migrate reset` or `db push` against a shared database.

### Running a migration by hand

For a failed or blocked build, or an emergency, from a machine with the repository and Node 24:

```bash
cd apps/web
# the DIRECT (non-pooled) url of the migrator role, with ?schema=platform at the end
DATABASE_URL='postgresql://sineva_migrator:<pw>@<direct-host>/sineva_platform?sslmode=require&schema=platform' \
  npx prisma migrate status
DATABASE_URL='...same...' npx prisma migrate deploy
```

Print only the host and database name before running anything. Never seed (section 10).

## 8. First deploy, step by step

1. Create the services (section 2) and the project (section 3).
2. Add the variables for Production (section 4). At minimum the build needs `NEXT_PUBLIC_APP_URL` and `DIRECT_DATABASE_URL`.
3. Deploy the production branch. The build migrates the empty database (all migrations applied, gate skipped), then builds.
4. Open the deployment's build log: check `Node 24.x.y`, the applied migration names, and that no warning is left that you care about.
5. Attach the domain (section 5) and set `NEXT_PUBLIC_APP_URL`, then redeploy.
6. **Vault roles (once per environment).** After the migration `vault_and_connections` is applied, run as a superuser (never from the build):

```bash
psql "$ADMIN_DATABASE_URL" -v app_role=sineva_app -v vault_role=sineva_vault -v owner_role=sineva_migrator \
  -f apps/web/prisma/ops/vault_roles.sql
```

   It makes the migrator the owner of `vault_secrets`, removes the application role's access to it and grants the vault role. Check as `sineva_app`: `SELECT * FROM platform.vault_secrets` must say `permission denied`. Re-run the script after any migration that recreates or drops that table: a recreated table would pick up the default privileges again.
7. Register the OAuth redirect URLs (section 6) and set the provider variables; redeploy.
8. Tell the `sineva-ai` team the final platform URL, the internal key and the public signing key.
9. Run the smoke checklist (section 9).

## 9. Post-deploy smoke checklist

- [ ] `GET https://sineva.id/api/v1/health` answers 200 with `{"success":true,"data":{"status":"healthy"}}` and nothing else (no hostnames or versions).
- [ ] Response headers on `/sign-in` include `X-Frame-Options: DENY` and a `Content-Security-Policy-Report-Only` with a nonce that changes per request.
- [ ] Sign up with a real address: the verification email arrives and its link starts with the production origin.
- [ ] Sign in with Google and with GitHub (if enabled): the provider returns to `/api/v1/auth/oauth/<provider>/callback` and lands signed in.
- [ ] Upload an avatar: the browser `PUT` to the bucket succeeds (no CORS error in the console) and the image shows.
- [ ] Send a chat message: the reply streams. Reload the tab mid-reply: the stream resumes (served from `sineva-ai` events).
- [ ] Settings, Cron Jobs in the Vercel project lists both jobs. Use "Run" on each and check the log answers 200 (a 401 means `CRON_SECRET` is missing or differs).
- [ ] `/dev/ui` answers 404.
- [ ] Connections: the provider list shows Google Calendar, Gmail and Notion as available when their credentials are configured; connect one. For Gmail, check the connected account, selected access bundle and specialist grants. This checks account linking; email actions still need the Tool Gateway (see section 6.1).
- [ ] Vercel logs show no `Configuration error` lines.
- [ ] No seeded account exists (section 10).

## 10. Seeding policy

Never run `npm run db:seed` against production or staging. The seed creates development tenants with a known password (`admin@sineva.id`, `owner@acme.com`). The build script never seeds. Create the first real account through the sign-up page; promote staff roles by hand, with an audited change, not from the seed file.

## 11. Rollback

1. **Code:** Vercel, Deployments, pick the last good deployment, Promote to Production (Instant Rollback). It restores that deployment's cron definitions; the "Disable Cron Jobs" setting persists across rollbacks ([docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)).
2. **Database:** migrations are not rolled back. Because every migration is backward compatible with the previous release (expand, then contract), the previous code runs against the new schema. If a migration was destructive and approved, restore from a Neon point-in-time branch instead, then run the vault roles script again.
3. **Failed migration:** the build failed, nothing was promoted, the old deployment still serves. Fix forward with a new migration; use the manual commands in section 7 if the database is half applied (`migrate status` shows which one failed; resolve it by hand before redeploying).

## 12. How the app behaves on Vercel

- **Streaming.** The event stream route runs up to 300 s. In-memory run state is per instance. If a reconnect lands on another instance, the platform serves it from `sineva-ai`'s stored events (`Last-Event-ID` is honored); before the engine has reported its run id the client gets a retryable 409 and reconnects. A reply whose browser left is stored when someone resumes it; this is a known gap ([ADR-0047](../decisions/0047-hosting-on-vercel.md)).
- **Cron.** `GET /api/internal/v1/inbox/expire` and `GET /api/internal/v1/jobs/tick`, every minute, authenticated by `Authorization: Bearer $CRON_SECRET`. Delivery is best effort and may repeat; both jobs are idempotent. No retry on failure ([docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). Both routes also accept `X-Internal-Api-Key` for manual calls. `GET /internal/v1/jobs/stats` stays key-only.
- **Database connections.** Each warm instance holds a pool of at most `DATABASE_POOL_MAX` connections to the pooled endpoint. Total roughly instances times pool size; keep it small.
- **Headers and CSP.** `next.config.ts` headers and the nonce proxy (`src/proxy.ts`) run on Vercel unchanged. `output: 'standalone'` is not used.
- **Health.** `/api/v1/health` returns only `{status}` to the public (detail only for staff).
