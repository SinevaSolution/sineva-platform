import { spawnSync } from 'node:child_process';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Shared helpers for the browser journeys. Everything here talks to the stack
// that `scripts/e2e_journeys.mjs` starts: the local Mailpit for email, the fake
// identity provider for Google/GitHub, and the throwaway Postgres container for
// the two things a browser cannot do (age a session or an invitation).

const MAILPIT = 'http://127.0.0.1:8025';
export const RUN_ID = process.env.JOURNEYS_RUN_ID ?? 'manual';
const IDP = process.env.JOURNEYS_IDP_URL ?? '';
const PG_CONTAINER = process.env.JOURNEYS_PG_CONTAINER ?? '';
const PG_DATABASE = process.env.JOURNEYS_PG_DATABASE ?? '';

/** Seed accounts (apps/web/prisma/seed.ts); the password is the seed's, read from the environment. */
export const SEED_PASSWORD = process.env.JOURNEYS_SEED_PASSWORD ?? '';
// The seed upserts workspaces by slug, so their ids are not fixed: look them up.
export const ACME = {
  slug: 'acme-corp',
  get id() {
    return sql("select id from platform.workspaces where workspace_slug = 'acme-corp'");
  },
};
export const HQ = { slug: 'sineva-hq' };
export const OWNER_EMAIL = 'owner@acme.com';
export const SECOND_EMAIL = 'admin@sineva.id';
/** Unique per run and per label so Mailpit searches never see another run's mail. */
export const addressFor = (label: string) => `journeys-${RUN_ID}-${label}@example.org`;
/** Meets the 12 character rule; never reused across labels in a way that matters. */
export const strongPassword = (label: string) => `Journey-${label}-${RUN_ID}-Pw!9`;

// ---------------------------------------------------------------- Mailpit

interface MailpitMessage {
  ID: string;
  Subject: string;
  Created: string;
  To: Array<{ Address: string }>;
}

async function listMessages(to: string): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const body = (await res.json()) as { messages?: MailpitMessage[] };
  return body.messages ?? [];
}

/** Mailpit is shared across runs and the seed accounts have fixed addresses: only mail from this run counts. */
const STARTED_AT = Date.now() - 5_000;

export interface Mail {
  id: string;
  subject: string;
  text: string;
  html: string;
  links: string[];
}

/**
 * Waits for the `count`-th message (1-based) to an address and returns its
 * links. Counting instead of "latest" keeps a resend from matching the first
 * mail of the same person.
 */
export async function waitForMail(to: string, count = 1, subject?: RegExp): Promise<Mail> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const all = (await listMessages(to))
      .filter((m) => Date.parse(m.Created) >= STARTED_AT)
      .filter((m) => !subject || subject.test(m.Subject))
      .sort((a, b) => a.Created.localeCompare(b.Created));
    const found = all[count - 1];
    if (found) {
      const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const text = detail.Text || detail.HTML;
      const links = [...text.matchAll(/https?:\/\/[^\s"<>)\]]+/g)].map((m) =>
        m[0].replace(/[.,]$/, ''),
      );
      return { id: found.ID, subject: found.Subject, text, html: detail.HTML ?? '', links };
    }
    if (Date.now() > deadline) throw new Error(`No mail #${count} to ${to} within 30s`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** The one link in a mail whose path starts with `prefix`, as a path plus query for the browser. */
export function linkWithPath(mail: Mail, prefix: string): string {
  const link = mail.links.find((l) => new URL(l).pathname.startsWith(prefix));
  if (!link) throw new Error(`No ${prefix} link in "${mail.subject}": ${mail.links.join(' ')}`);
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
}

// ------------------------------------------------------------- identity provider

export async function setIdentity(
  provider: 'google' | 'github',
  identity: { sub: string; email: string; name: string; login?: string },
): Promise<void> {
  const res = await fetch(`${IDP}/_test/identity`, {
    method: 'POST',
    body: JSON.stringify({ provider, ...identity }),
  });
  expect(res.ok).toBe(true);
}

export async function denyNextConsent(provider: 'google' | 'github'): Promise<void> {
  const res = await fetch(`${IDP}/_test/deny`, {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
  expect(res.ok).toBe(true);
}

// ------------------------------------------------------------------ database

/** Runs SQL in the throwaway database and returns the raw rows (tab separated). */
export function sql(statement: string): string {
  const result = spawnSync(
    'docker',
    ['exec', PG_CONTAINER, 'psql', '-U', 'postgres', '-d', PG_DATABASE, '-At', '-c', statement],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** Ages every session of a person past the fresh window, as if they signed in an hour ago. */
export function makeSessionsStale(email: string): void {
  sql(
    `update platform.sessions set fresh_until = now() - interval '1 minute'
     where user_id = (select id from platform.users where email = '${email}')`,
  );
}

export function makeSessionsFresh(email: string): void {
  sql(
    `update platform.sessions set fresh_until = now() + interval '10 minutes'
     where user_id = (select id from platform.users where email = '${email}')`,
  );
}

/** Moves the expiry of an address's open invitation into the past. */
export function expireInvitation(email: string): void {
  sql(
    `update platform.workspace_invitations set expires_at = now() - interval '1 day'
     where email = '${email}' and accepted_at is null and revoked_at is null`,
  );
}

export function hasCredentialPassword(email: string): boolean {
  return (
    sql(
      `select count(*) from platform.accounts
       where provider_id = 'credential' and password is not null
         and user_id = (select id from platform.users where email = '${email}')`,
    ) === '1'
  );
}

// ------------------------------------------------------------------ browser

export async function newPerson(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

export async function signInWithPassword(
  page: Page,
  email: string,
  password: string,
  next?: string,
) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // The session cookie is set once the page has left the sign-in form.
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** Signs in with the fake Google (or GitHub) identity already set for it. */
export async function signInWithProvider(page: Page, provider: 'google' | 'github') {
  await page.goto('/sign-in');
  await page.getByRole('link', { name: new RegExp(provider, 'i') }).click();
}

export function membersUrl(slug: string): string {
  return `/w/${slug}/settings/members`;
}

/** A row of the members list (the people, not the pending invitations). */
export function memberRow(page: Page, name: string | RegExp) {
  return page
    .locator('li', { hasText: name })
    .filter({ has: page.getByText(/Owner|Admin|Member|Viewer/) })
    .first();
}

export const toast = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]', { hasText: text });
