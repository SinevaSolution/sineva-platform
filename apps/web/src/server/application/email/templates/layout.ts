import type { EmailLocale } from '@/server/domain/email/email_sender';

// One layout for every transactional email, so they all look like Sineva and
// all survive the same mail clients. The rules it follows:
//
// - Tables and inline styles only. Gmail, Outlook (desktop uses Word's engine)
//   and Apple Mail each drop a different part of modern CSS; nested tables with
//   inline `style` and `bgcolor` work in all of them.
// - Every layer sets its own background AND text color. Clients that invert
//   colors in dark mode then still show dark text on a light surface or the
//   reverse, never light text on a light surface. A `prefers-color-scheme`
//   block (honored by Apple Mail and some others) swaps to a dark palette.
// - The call to action is a "bulletproof" button: a padded table cell with the
//   link inside, plus a VML rounded rectangle for Outlook desktop, which
//   ignores border-radius and padding on links.
// - Images carry width, height and alt, so the layout holds with images blocked.
//   No tracking pixels, no external CSS, no web fonts needed (a system stack
//   follows the brand face).
// - User-controlled strings (names) are escaped here, once, and callers pass
//   plain text. That is why `Inline` has no raw-HTML member.

export type Inline = string | { strong: string };

export interface EmailLayoutInput {
  locale: EmailLocale;
  /** Hidden text that mail lists show after the subject. */
  preheader: string;
  greeting?: string;
  heading: string;
  /** Paragraphs under the heading; plain text pieces, optionally bold. */
  paragraphs: Inline[][];
  button?: { label: string; url: string; tone?: 'brand' | 'alert' };
  /** Lead-in of the plain link shown under the button ("Or paste this link..."). */
  linkLead?: string;
  /** Small, quiet lines (expiry, who the link works for). */
  notes?: string[];
  /** Closing lines in the plain-text version and under the card ("Warm regards", team). */
  signoff?: string[];
  /** Why this person got the email. */
  reason: string;
  /** Origin of the app (for the Sino image); derived from the link when absent. */
  appUrl?: string;
}

const BRAND = '#00686d';
const INK = '#0b2a31';
const INK_SOFT = '#3f5359';
const INK_MUTED = '#5b6f75';
const TINT = '#eaf6f6';
const TINT_DEEP = '#d3eeee';
const PAGE = '#f4f7f7';
const CARD = '#ffffff';
const BORDER = '#d9e4e6';
const ALERT = '#b42318';
const FONT = "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The origin of a URL, or undefined when it is not an absolute http(s) URL. */
export function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

const SINO_ALT: Record<EmailLocale, string> = {
  en: 'Sino waving hello',
  id: 'Sino melambai menyapa',
};

const FOOTER_LINE = 'Sineva · sineva.id';

function inlineHtml(pieces: Inline[]): string {
  return pieces
    .map((p) =>
      typeof p === 'string'
        ? escapeHtml(p)
        : `<strong style="font-weight:700;color:${INK};" class="sv-strong">${escapeHtml(p.strong)}</strong>`,
    )
    .join('');
}

function inlineText(pieces: Inline[]): string {
  return pieces.map((p) => (typeof p === 'string' ? p : p.strong)).join('');
}

function buttonHtml(button: NonNullable<EmailLayoutInput['button']>): string {
  const color = button.tone === 'alert' ? ALERT : BRAND;
  const href = escapeHtml(button.url);
  const label = escapeHtml(button.label);
  // The VML branch is for Outlook desktop only; every other client reads the
  // conditional comment as a comment and uses the table cell below it.
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="24%" stroke="f" fillcolor="${color}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${color}" style="background-color:${color};border-radius:12px;">
      <a href="${href}" target="_blank" class="sv-button" style="display:inline-block;padding:15px 32px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;background-color:${color};">${label}</a>
    </td>
  </tr>
</table>
<!--<![endif]-->`;
}

export function renderLayout(input: EmailLayoutInput): { html: string; text: string } {
  const origin = originOf(input.appUrl) ?? originOf(input.button?.url);
  const lang = input.locale;
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p class="sv-text" style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:25px;color:${INK_SOFT};">${inlineHtml(p)}</p>`,
    )
    .join('\n          ');
  const notes = (input.notes ?? [])
    .map(
      (n) =>
        `<p class="sv-muted" style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${INK_MUTED};">${escapeHtml(n)}</p>`,
    )
    .join('\n          ');
  const linkBlock = input.button
    ? `<p class="sv-muted" style="margin:28px 0 6px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${INK_MUTED};">${escapeHtml(input.linkLead ?? '')}</p>
          <p style="margin:0 0 20px 0;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(input.button.url)}" class="sv-link" style="color:${BRAND};text-decoration:underline;">${escapeHtml(input.button.url)}</a></p>`
    : '';
  const sino = origin
    ? `<img src="${escapeHtml(origin)}/email/sino-wave.png" width="120" height="120" alt="${escapeHtml(SINO_ALT[lang])}" style="display:block;border:0;outline:none;text-decoration:none;width:120px;height:120px;margin:0 auto;">`
    : '';
  const signoff = (input.signoff ?? [])
    .map(
      (line) =>
        `<p class="sv-text" style="margin:0;font-family:${FONT};font-size:15px;line-height:23px;color:${INK_SOFT};">${escapeHtml(line)}</p>`,
    )
    .join('\n          ');

  const html = `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(input.heading)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body, table, td, p, a { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
  img { -ms-interpolation-mode: bicubic; }
  @media (max-width: 620px) {
    .sv-card { padding: 28px 20px !important; }
    .sv-outer { padding: 12px 8px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .sv-page { background-color: #0a1d22 !important; }
    .sv-card { background-color: #12292f !important; border-color: #234047 !important; }
    .sv-band { background-color: #0f3b40 !important; background-image: none !important; }
    .sv-text { color: #c9d8db !important; }
    .sv-strong, .sv-title { color: #eef4f5 !important; }
    .sv-muted { color: #93a8ad !important; }
    .sv-link { color: #4fd1d8 !important; }
    .sv-wordmark { color: #7fe0e5 !important; }
  }
</style>
</head>
<body class="sv-page" style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" class="sv-page" style="background-color:${PAGE};">
  <tr>
    <td align="center" class="sv-outer" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
        <tr>
          <td class="sv-band" align="center" bgcolor="${TINT}" style="background-color:${TINT};background-image:linear-gradient(180deg,${TINT_DEEP} 0%,${TINT} 100%);border-radius:20px 20px 0 0;padding:28px 24px 8px 24px;">
            <p class="sv-wordmark" style="margin:0 0 12px 0;font-family:${FONT};font-size:26px;line-height:30px;font-weight:800;letter-spacing:-0.5px;color:${BRAND};">Sineva</p>
            ${sino}
          </td>
        </tr>
        <tr>
          <td class="sv-card" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${BORDER};border-top:0;border-radius:0 0 20px 20px;padding:36px 40px 32px 40px;">
          ${input.greeting ? `<p class="sv-text" style="margin:0 0 12px 0;font-family:${FONT};font-size:16px;line-height:25px;color:${INK_SOFT};">${escapeHtml(input.greeting)}</p>` : ''}
          <h1 class="sv-title" style="margin:0 0 16px 0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:800;letter-spacing:-0.3px;color:${INK};">${escapeHtml(input.heading)}</h1>
          ${paragraphs}
          ${input.button ? `<div style="margin:28px 0 0 0;text-align:center;">${buttonHtml(input.button)}</div>` : ''}
          ${linkBlock}
          ${notes}
          ${signoff ? `<div style="margin-top:24px;">${signoff}</div>` : ''}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 24px 0 24px;">
            <p class="sv-muted" style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${INK_MUTED};">${escapeHtml(input.reason)}</p>
            <p class="sv-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${INK_MUTED};">${escapeHtml(FOOTER_LINE)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textParts: string[] = [];
  if (input.greeting) textParts.push(input.greeting, '');
  textParts.push(input.heading, '');
  for (const p of input.paragraphs) textParts.push(inlineText(p), '');
  if (input.button) textParts.push(`${input.button.label}:`, input.button.url, '');
  for (const n of input.notes ?? []) textParts.push(n);
  if (input.notes?.length) textParts.push('');
  for (const s of input.signoff ?? []) textParts.push(s);
  if (input.signoff?.length) textParts.push('');
  textParts.push('--', input.reason, FOOTER_LINE);
  return { html, text: textParts.join('\n') };
}
