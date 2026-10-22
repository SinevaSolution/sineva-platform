import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  ACME,
  HQ,
  OWNER_EMAIL,
  SECOND_EMAIL,
  SEED_PASSWORD,
  addressFor,
  denyNextConsent,
  expireInvitation,
  hasCredentialPassword,
  linkWithPath,
  makeSessionsFresh,
  makeSessionsStale,
  membersUrl,
  newPerson,
  setIdentity,
  signInWithPassword,
  signInWithProvider,
  sql,
  strongPassword,
  toast,
  waitForMail,
  RUN_ID,
} from '../support/journeys';

// The invitation, role, ownership and sign-in-method journeys of WP-M1-29, end
// to end in a real browser against a temporary production build. They share one
// workspace (Acme Corp) and build on each other, so they run in order.
test.describe.configure({ mode: 'serial' });

const INVITE_SUBJECT = /invited you|mengundang kamu/i;
const VERIFY_SUBJECT = /verify your email|verifikasi email/i;
const OWNERSHIP_SUBJECT = /hand you|menyerahkan/i;
const RESET_SUBJECT = /reset your|atur ulang/i;

const dialogWith = (page: Page, text: string | RegExp): Locator =>
  page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text });

/** The row of one person in the members list (not the pending invitations). */
const personRow = (page: Page, text: string | RegExp): Locator =>
  page
    .locator('ul > li')
    .filter({ hasText: text })
    .filter({ hasText: /Owner|Admin|Member|Viewer/ })
    .first();

async function chooseOption(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Owner or admin invites an address from the members page; returns the copied link path. */
async function invite(
  page: Page,
  email: string,
  options: { role?: 'Admin' | 'Member' | 'Viewer'; specialists?: string[] } = {},
): Promise<string> {
  await page.goto(membersUrl(ACME.slug));
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = dialogWith(page, 'Invite member');
  await dialog.getByLabel('Email address').fill(email);
  if (options.role && options.role !== 'Member')
    await chooseOption(page, dialog, 'Role', options.role);
  if (options.specialists?.length) {
    await chooseOption(page, dialog, 'Specialist access', 'Selected specialists');
    for (const name of options.specialists) await dialog.getByRole('checkbox', { name }).check();
  }
  await dialog.getByRole('button', { name: 'Invite member' }).click();
  await expect(page.getByText(`We emailed ${email}`)).toBeVisible();
  const url = new URL(await page.locator('input[readonly]').first().inputValue());
  expect(url.pathname).toMatch(/^\/invite\/[A-Za-z0-9_-]{16,}$/);
  return url.pathname;
}

const olgaEmail = addressFor('olga');
const olgaGithubSub = String(7_000_000 + (parseInt(RUN_ID, 16) % 1_000_000));
const newbieEmail = addressFor('newbie');
const newbiePassword = strongPassword('newbie');

let owner: Awaited<ReturnType<typeof newPerson>>;
let second: Awaited<ReturnType<typeof newPerson>>;
let newbie: Awaited<ReturnType<typeof newPerson>>;
let olga: Awaited<ReturnType<typeof newPerson>>;
let newbieInvitePath = '';

test.beforeAll(async ({ browser }) => {
  // Emails follow the workspace language; the checks below read English first.
  sql(`update platform.workspaces set default_locale = 'en' where id = '${ACME.id}'`);
  owner = await newPerson(browser);
  await signInWithPassword(owner.page, OWNER_EMAIL, SEED_PASSWORD);
  await owner.page.waitForURL(new RegExp(`/w/${ACME.slug}`));
  second = await newPerson(browser);
  newbie = await newPerson(browser);
  olga = await newPerson(browser);
});

test.afterAll(async () => {
  await Promise.all([owner, second, newbie, olga].map((p) => p?.context.close()));
});

test('(a) owner invites a new email with selected specialists; the invitee signs up, verifies, signs in and joins', async () => {
  newbieInvitePath = await invite(owner.page, newbieEmail, {
    specialists: ['SinoFinance', 'SinoSales'],
  });

  // The email carries the same working link as the owner's copy button.
  const mail = await waitForMail(newbieEmail, 1, INVITE_SUBJECT);
  expect(linkWithPath(mail, '/invite/')).toBe(newbieInvitePath);

  // The email is the shared Sineva layout: subject, button, Sino image, plain text.
  expect(mail.subject).toMatch(/invited you to join Acme Corporation on Sineva/);
  expect(mail.html).toContain('>Join Acme Corporation</a>');
  expect(mail.html).toContain('role="presentation"');
  expect(mail.html).toMatch(/<img [^>]*src="[^"]+\/email\/sino-wave\.png"[^>]*alt="[^"]+"/);
  expect(mail.text).toContain(newbieInvitePath);
  expect(mail.text).toContain('This invitation works for 7 days.');
  const sino = mail.html.match(/src="([^"]+\/email\/sino-wave\.png)"/)?.[1] ?? '';
  const image = await fetch(sino);
  expect(image.status).toBe(200);
  expect(image.headers.get('content-type')).toBe('image/png');

  // Signed out, the link shows who invited and the two ways in.
  const p = newbie.page;
  await p.goto(newbieInvitePath);
  await expect(p.getByText(/invited to Acme Corporation as Member/)).toBeVisible();
  await expect(p.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await p.getByRole('link', { name: 'Create account' }).click();

  // Sign-up keeps the way back to the invitation.
  await expect(p).toHaveURL(new RegExp(`/sign-up\\?next=${encodeURIComponent(newbieInvitePath)}`));
  await p.locator('input[name="full_name"]').fill('Nia Newbie');
  await p.locator('input[name="email"]').fill(newbieEmail);
  await p.locator('input[name="password"]').fill(newbiePassword);
  await p.locator('input[name="consent"]').check();
  await p.getByRole('button', { name: /create account|buat akun/i }).click();
  await expect(p.getByText(newbieEmail)).toBeVisible();

  const verify = await waitForMail(newbieEmail, 1, VERIFY_SUBJECT);
  const verifyLink = linkWithPath(verify, '/verify-email');
  expect(decodeURIComponent(verifyLink)).toContain(newbieInvitePath);
  await p.goto(verifyLink);
  await expect(p.getByText(/verified|terverifikasi/i).first()).toBeVisible();
  await p.getByRole('link', { name: /continue|lanjut/i }).click();

  // Sign in returns to the invitation, then one deliberate click joins.
  await expect(p).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(newbieInvitePath)}`));
  await p.locator('input[name="email"]').fill(newbieEmail);
  await p.locator('input[name="password"]').fill(newbiePassword);
  await p.getByRole('button', { name: /^sign in$/i }).click();
  await expect(p).toHaveURL(new RegExp(`${newbieInvitePath}$`));
  await p.getByRole('button', { name: 'Join workspace' }).click();
  await expect(p).toHaveURL(new RegExp(`/w/${ACME.slug}$`));

  // The right role and scope, seen from the owner's side...
  await owner.page.goto(membersUrl(ACME.slug));
  const row = personRow(owner.page, 'Nia Newbie');
  await expect(row).toContainText('Member');
  await expect(row).toContainText('2 selected');
  await row.click();
  const drawer = dialogWith(owner.page, 'Nia Newbie');
  await expect(drawer.getByRole('checkbox', { name: 'SinoFinance' })).toBeChecked();
  await expect(drawer.getByRole('checkbox', { name: 'SinoSales' })).toBeChecked();
  await expect(drawer.getByRole('checkbox', { name: 'SinoPeople' })).not.toBeChecked();
  await owner.page.keyboard.press('Escape');

  // ...and from the member's own: a limited list with no contact details.
  await p.goto(membersUrl(ACME.slug));
  await expect(personRow(p, 'Nia Newbie')).toBeVisible();
  await expect(p.getByText('Last active')).toHaveCount(0);
  await expect(p.getByText(OWNER_EMAIL)).toHaveCount(0);
});

test('(b) an existing user accepts while signed in', async () => {
  const path = await invite(owner.page, SECOND_EMAIL);
  const mail = await waitForMail(SECOND_EMAIL, 1, INVITE_SUBJECT);
  expect(linkWithPath(mail, '/invite/')).toBe(path);

  const p = second.page;
  await signInWithPassword(p, SECOND_EMAIL, SEED_PASSWORD);
  await p.waitForURL(new RegExp(`/w/${HQ.slug}`));
  await p.goto(path);
  await expect(p.getByRole('button', { name: 'Join workspace' })).toBeVisible();
  await p.getByRole('button', { name: 'Join workspace' }).click();
  await expect(p).toHaveURL(new RegExp(`/w/${ACME.slug}$`));
});

test('(h) the switcher lists both workspaces with their roles; switching changes the URL and drops client state', async () => {
  const p = second.page;
  await p.goto(`/w/${ACME.slug}/new`);
  await p.locator('textarea').first().fill('a draft that belongs to Acme');

  await p
    .getByRole('button', { name: /Acme Corp/ })
    .first()
    .click();
  const menu = p.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /Sineva HQ.*Owner/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Acme Corp.*Member/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: /Sineva HQ/ }).click();

  await expect(p).toHaveURL(new RegExp(`/w/${HQ.slug}`));
  await p.getByRole('link', { name: 'New chat' }).click();
  await expect(p.locator('textarea').first()).toHaveValue('');
  // Back again: nothing leaked in either direction.
  await p
    .getByRole('button', { name: /Sineva HQ/ })
    .first()
    .click();
  await p.getByRole('menuitem', { name: /Acme Corp/ }).click();
  await expect(p).toHaveURL(new RegExp(`/w/${ACME.slug}`));
  await p.getByRole('link', { name: 'New chat' }).click();
  await expect(p.locator('textarea').first()).toHaveValue('');
});

test('(c) the wrong account signed in sees a clear mismatch with Switch account', async () => {
  const wrongEmail = addressFor('wrong');
  const path = await invite(owner.page, wrongEmail);
  const p = second.page; // signed in as someone else
  await p.goto(path);
  await expect(p.getByText(/sent to a different account/)).toBeVisible();
  await expect(p.getByRole('button', { name: 'Join workspace' })).toHaveCount(0);
  await p.getByRole('button', { name: 'Switch account' }).click();
  await expect(p).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}`));
  // Signed out now: the invited person can continue from here.
  await p.goto(`/w/${ACME.slug}`);
  await expect(p).toHaveURL(/\/sign-in/);
});

test('(d)(e) used, expired and revoked links say why; resend replaces the link; revoke closes it', async ({
  browser,
}) => {
  const visitor = await newPerson(browser);
  const p = visitor.page;

  // Used: the newbie link was accepted in (a).
  await p.goto(newbieInvitePath);
  await expect(p.getByText('This invitation was already used.')).toBeVisible();
  await expect(p.getByRole('button', { name: 'Join workspace' })).toHaveCount(0);

  // Expired: age an open invitation, see it on the members page and on its link.
  const lateEmail = addressFor('late');
  // The same invitation email in Indonesian when the workspace speaks Indonesian.
  sql(`update platform.workspaces set default_locale = 'id' where id = '${ACME.id}'`);
  const oldPath = await invite(owner.page, lateEmail);
  const idMail = await waitForMail(lateEmail, 1, INVITE_SUBJECT);
  expect(idMail.subject).toBe('Budi mengundang kamu bergabung ke Acme Corporation di Sineva');
  expect(idMail.html).toContain('>Gabung ke Acme Corporation</a>');
  expect(idMail.text).toContain('Undangan ini berlaku selama 7 hari.');
  expect(idMail.text).not.toMatch(/\bAnda\b/);
  sql(`update platform.workspaces set default_locale = 'en' where id = '${ACME.id}'`);
  expireInvitation(lateEmail);
  await p.goto(oldPath);
  await expect(
    p.getByText('This invitation has expired. Ask the owner to send a new one.'),
  ).toBeVisible();
  await owner.page.goto(membersUrl(ACME.slug));
  const pending = owner.page.locator('li').filter({ hasText: lateEmail });
  await expect(pending.getByText('Expired')).toBeVisible();

  // Resend: a new mail and a new link; the old one stops working.
  await pending.getByRole('button', { name: 'Resend invitation' }).click();
  await expect(toast(owner.page, `Invitation sent again to ${lateEmail}`)).toBeVisible();
  const second1 = await waitForMail(lateEmail, 2, INVITE_SUBJECT);
  const newPath = linkWithPath(second1, '/invite/');
  expect(newPath).not.toBe(oldPath);
  await p.goto(oldPath);
  await expect(p.getByText("Sino can't find this page")).toBeVisible();
  await p.goto(newPath);
  await expect(p.getByRole('link', { name: 'Create account' })).toBeVisible();

  // Revoke: confirm, the row leaves the list, the link says it was cancelled.
  await owner.page.goto(membersUrl(ACME.slug));
  await owner.page
    .locator('li')
    .filter({ hasText: lateEmail })
    .getByRole('button', { name: 'Revoke invitation' })
    .click();
  await dialogWith(owner.page, 'Revoke this invitation?')
    .getByRole('button', { name: 'Revoke invitation' })
    .click();
  await expect(toast(owner.page, 'Invitation revoked.')).toBeVisible();
  await expect(owner.page.locator('li').filter({ hasText: lateEmail })).toHaveCount(0);
  await p.goto(newPath);
  await expect(
    p.getByText('This invitation was cancelled. Ask the owner to send a new one.'),
  ).toBeVisible();
  await visitor.context.close();
});

test('(f) role change; removal needs a fresh session, the password confirms it, and the removed person is out at once', async () => {
  // Role change from the detail drawer.
  await owner.page.goto(membersUrl(ACME.slug));
  await personRow(owner.page, 'Nia Newbie').click();
  const drawer = dialogWith(owner.page, 'Nia Newbie');
  await chooseOption(owner.page, drawer, 'Role', 'Viewer');
  await drawer.getByRole('button', { name: 'Save changes' }).click();
  await expect(toast(owner.page, 'Changes saved.')).toBeVisible();
  await expect(personRow(owner.page, 'Nia Newbie')).toContainText('Viewer');

  // The person about to be removed is signed in and has access.
  await signInWithPassword(second.page, SECOND_EMAIL, SEED_PASSWORD);
  await second.page.goto(`/w/${ACME.slug}`);
  await expect(second.page.getByRole('link', { name: 'New chat' })).toBeVisible();

  // Removal on a stale session: Confirm it's you, with the password.
  makeSessionsStale(OWNER_EMAIL);
  await owner.page.goto(membersUrl(ACME.slug));
  await owner.page.getByRole('button', { name: /^Remove Alice/ }).click();
  await dialogWith(owner.page, 'Remove this member?')
    .getByRole('button', { name: 'Remove member' })
    .click();
  const confirm = dialogWith(owner.page, "Confirm it's you");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('link', { name: /Continue with/ })).toHaveCount(0);
  await confirm.getByLabel('Password').fill('not the password');
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(confirm.getByText('That password is not right. Try again.')).toBeVisible();
  await confirm.getByLabel('Password').fill(SEED_PASSWORD);
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(toast(owner.page, /Alice.* was removed\./)).toBeVisible();
  await expect(personRow(owner.page, 'admin@sineva.id')).toHaveCount(0);

  // The removed person loses the workspace on the very next request.
  await second.page.goto(`/w/${ACME.slug}`);
  await expect(second.page.getByText("Sino can't find this page")).toBeVisible();
  const api = await second.context.request.get(`/api/v1/workspaces/${ACME.id}/members`);
  expect(api.status()).toBe(404);
});

test('(f2) an account that only signs in with Google re-confirms through Google and the removal finishes', async () => {
  // Olga signs up through the (fake) Google and has no password.
  await setIdentity('google', { sub: `g-${RUN_ID}`, email: olgaEmail, name: 'Olga Oauth' });
  await signInWithProvider(olga.page, 'google');
  await olga.page.waitForURL(/\/w\//);
  // New provider accounts start in Indonesian; the checks below read English.
  sql(`update platform.users set locale = 'en' where email = '${olgaEmail}'`);
  await olga.page.reload();

  // The owner makes her an admin; she joins with the matching, verified address.
  makeSessionsFresh(OWNER_EMAIL);
  const path = await invite(owner.page, olgaEmail, { role: 'Admin' });
  await olga.page.goto(path);
  await olga.page.getByRole('button', { name: 'Join workspace' }).click();
  await expect(olga.page).toHaveURL(new RegExp(`/w/${ACME.slug}$`));

  // Her session is old now; removing the Viewer needs a fresh one.
  makeSessionsStale(olgaEmail);
  await olga.page.goto(membersUrl(ACME.slug));
  await olga.page.getByRole('button', { name: 'Remove Nia Newbie' }).click();
  await dialogWith(olga.page, 'Remove this member?')
    .getByRole('button', { name: 'Remove member' })
    .click();
  const confirm = dialogWith(olga.page, "Confirm it's you");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByLabel('Password')).toHaveCount(0);
  await confirm.getByRole('link', { name: 'Continue with Google' }).click();

  // Back on the members page, the removal she asked for has been carried out.
  await expect(olga.page).toHaveURL(new RegExp(`${membersUrl(ACME.slug)}$`));
  await expect(toast(olga.page, 'Nia Newbie was removed.')).toBeVisible();
  await expect(personRow(olga.page, 'Nia Newbie')).toHaveCount(0);
  await newbie.page.goto(`/w/${ACME.slug}`);
  await expect(newbie.page.getByText("Sino can't find this page")).toBeVisible();
});

test('(f3) a cancelled or wrong-account provider round trip changes nothing and says so', async () => {
  makeSessionsStale(olgaEmail);
  // Cancelled at the consent screen.
  await denyNextConsent('google');
  await olga.page.goto(
    `/api/v1/auth/oauth/google?intent=reauth&return_to=${encodeURIComponent(membersUrl(ACME.slug))}`,
  );
  await expect(olga.page.getByText('You cancelled, so nothing was changed.')).toBeVisible();

  // A different Google account than the one linked to her.
  await setIdentity('google', {
    sub: `g-someone-else-${RUN_ID}`,
    email: addressFor('else'),
    name: 'Else',
  });
  await olga.page.goto(
    `/api/v1/auth/oauth/google?intent=reauth&return_to=${encodeURIComponent(membersUrl(ACME.slug))}`,
  );
  await expect(
    olga.page.getByText(
      'That was a different account. Use the one connected to your Sineva account.',
    ),
  ).toBeVisible();
  await setIdentity('google', { sub: `g-${RUN_ID}`, email: olgaEmail, name: 'Olga Oauth' });
});

test('mobile: the members list becomes cards, nothing overflows, and the pages pass an accessibility scan', async ({
  browser,
}) => {
  makeSessionsFresh(OWNER_EMAIL);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await phone.newPage();
  await signInWithPassword(p, OWNER_EMAIL, SEED_PASSWORD);
  await p.waitForURL(new RegExp(`/w/${ACME.slug}`));
  await p.goto(membersUrl(ACME.slug));
  await expect(personRow(p, OWNER_EMAIL)).toBeVisible();
  // The column header row belongs to the table layout only.
  await expect(p.getByText('Last active').first()).toBeHidden();
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(p.getByRole('button', { name: /^Edit access for/ }).first()).toBeVisible();

  for (const target of [membersUrl(ACME.slug), newbieInvitePath]) {
    await p.goto(target);
    const result = await new AxeBuilder({ page: p })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `${target}: ${v.id} ${v.nodes[0]?.html.slice(0, 120)}`),
    ).toEqual([]);
  }
  await phone.close();
});

test('(g) ownership transfer: the chosen admin re-confirms through Google and accepts', async () => {
  makeSessionsFresh(OWNER_EMAIL);
  await owner.page.goto(membersUrl(ACME.slug));
  await owner.page.getByRole('button', { name: 'Transfer ownership' }).click();
  const dialog = dialogWith(owner.page, 'Choose the next owner');
  await chooseOption(owner.page, dialog, 'Next owner', 'Olga Oauth');
  await dialog.getByRole('button', { name: 'Send ownership invitation' }).click();
  await expect(toast(owner.page, 'Ownership invitation sent to Olga Oauth.')).toBeVisible();

  const mail = await waitForMail(olgaEmail, 1, OWNERSHIP_SUBJECT);
  const path = linkWithPath(mail, '/ownership/');

  // The target's session is old: accepting asks her to confirm first.
  makeSessionsStale(olgaEmail);
  await olga.page.goto(path);
  await olga.page.getByRole('button', { name: 'Accept ownership' }).click();
  const confirm = dialogWith(olga.page, "Confirm it's you");
  await expect(confirm).toBeVisible();
  await confirm.getByRole('link', { name: 'Continue with Google' }).click();

  // Back at the same link: confirmed, nothing accepted yet, one deliberate click left.
  await expect(olga.page).toHaveURL(new RegExp(`${path}$`));
  await expect(olga.page.getByText('Confirmed. Press the button below to finish.')).toBeVisible();
  await olga.page.getByRole('button', { name: 'Accept ownership' }).click();
  await expect(olga.page).toHaveURL(new RegExp(`/w/${ACME.slug}$`));

  // She owns the workspace now and the previous owner is an admin.
  await olga.page.goto(membersUrl(ACME.slug));
  await expect(personRow(olga.page, 'Olga Oauth')).toContainText('Owner');
  await expect(personRow(olga.page, OWNER_EMAIL)).toContainText('Admin');
  await owner.page.goto(membersUrl(ACME.slug));
  await expect(owner.page.getByRole('button', { name: 'Transfer ownership' })).toHaveCount(0);
});

test('sign-in methods: connect, cancel, conflict, disconnect and set a password', async () => {
  const methodsUrl = `/w/${ACME.slug}/settings/profile?tab=sign_in`;
  const p = olga.page;
  makeSessionsFresh(olgaEmail);

  // Google is the only way in, so it cannot be disconnected; she can add a password.
  await p.goto(methodsUrl);
  await expect(p.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  await p.getByRole('button', { name: 'Disconnect' }).locator('..').hover();
  await expect(p.getByRole('tooltip', { name: 'Add another way to sign in first' })).toBeVisible();
  await expect(p.getByRole('button', { name: 'Set a password' })).toBeVisible();

  // Cancelled at GitHub: nothing linked, a clear message.
  await denyNextConsent('github');
  await p.getByRole('link', { name: 'Connect GitHub' }).click();
  await expect(p.getByText('You cancelled, so nothing was changed.')).toBeVisible();

  // Connected: back on the tab with a toast and a Linked pill.
  await setIdentity('github', {
    sub: olgaGithubSub,
    email: addressFor('olga-work'),
    name: 'Olga Oauth',
    login: 'olga-oauth',
  });
  await p.getByRole('link', { name: 'Connect GitHub' }).click();
  await expect(p).toHaveURL(/tab=sign_in/);
  await expect(toast(p, 'Connected. You can use it to sign in from now on.')).toBeVisible();
  await expect(p.getByText('olga-oauth').or(p.getByText(addressFor('olga-work')))).toBeVisible();

  // The same GitHub account cannot be connected to a second Sineva user.
  makeSessionsFresh(OWNER_EMAIL);
  await owner.page.goto(methodsUrl);
  await owner.page.getByRole('link', { name: 'Connect GitHub' }).click();
  await expect(
    owner.page.getByText('That account is already connected to another Sineva user.'),
  ).toBeVisible();

  // Disconnect on a stale session re-confirms through Google (no password) and then disconnects.
  makeSessionsStale(olgaEmail);
  await p.goto(methodsUrl);
  await p.getByRole('button', { name: 'Disconnect' }).last().click();
  await dialogWith(p, 'Disconnect GitHub?').getByRole('button', { name: 'Disconnect' }).click();
  const confirm = dialogWith(p, "Confirm it's you");
  await expect(confirm.getByLabel('Password')).toHaveCount(0);
  await confirm.getByRole('link', { name: 'Continue with Google' }).click();
  await expect(toast(p, 'GitHub was disconnected.')).toBeVisible();
  await expect(p.getByRole('link', { name: 'Connect GitHub' })).toBeVisible();

  // Connect again from a stale session: confirm first, then the link goes through.
  makeSessionsStale(olgaEmail);
  await p.goto(methodsUrl);
  await p.getByRole('link', { name: 'Connect GitHub' }).click();
  await dialogWith(p, "Confirm it's you")
    .getByRole('link', { name: 'Continue with Google' })
    .click();
  await expect(toast(p, 'Connected. You can use it to sign in from now on.')).toBeVisible();

  // Set a password: the reset email adds the first one, and it works for sign-in.
  makeSessionsFresh(olgaEmail);
  await p.goto(methodsUrl);
  await p.getByRole('button', { name: 'Set a password' }).click();
  await expect(toast(p, `We sent a link to ${olgaEmail}.`)).toBeVisible();
  const mail = await waitForMail(olgaEmail, 1, RESET_SUBJECT);
  await p.goto(linkWithPath(mail, '/reset-password'));
  const password = strongPassword('olga');
  await p.locator('input[name="password"]').fill(password);
  await p.locator('input[name="confirm"]').fill(password);
  await p
    .getByRole('button', { name: /reset|set|save|atur/i })
    .first()
    .click();
  await expect(
    p.getByText(/password.*(updated|changed|saved)|kata sandi.*(diperbarui|diubah)/i),
  ).toBeVisible();
  expect(hasCredentialPassword(olgaEmail)).toBe(true);

  const again = await newPerson(await p.context().browser()!);
  await signInWithPassword(again.page, olgaEmail, password);
  await again.page.waitForURL(/\/w\//);
  await again.page.goto(methodsUrl);
  await expect(again.page.getByRole('button', { name: 'Set a password' })).toHaveCount(0);
  await expect(again.page.getByRole('button', { name: 'Disconnect' }).first()).toBeEnabled();
  await again.context.close();
});
