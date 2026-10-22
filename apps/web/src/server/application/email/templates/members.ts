import type {
  EmailLocale,
  OwnershipTransferRequestParams,
  OwnershipTransferredNoticeParams,
  WorkspaceInvitationParams,
} from '@/server/domain/email/email_sender';
import type { LocaleTemplateMap } from './index';

// Invitation and ownership-transfer emails (WP-M1-28). They live beside the
// auth templates but in their own file: the workspace, inviter and person
// names are user-controlled, so every interpolated value goes through
// `escapeHtml`, and the link is the only place a token ever appears.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ROLE_NAMES: Record<EmailLocale, Record<string, string>> = {
  en: { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' },
  id: { owner: 'Pemilik', admin: 'Admin', member: 'Anggota', viewer: 'Peninjau' },
};

function roleName(locale: EmailLocale, role: string): string {
  return ROLE_NAMES[locale][role] ?? role;
}

function page(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
${body}
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      ${escapeHtml(label)}
    </a>
  </p>`;
}

export const workspaceInvitationTemplates: LocaleTemplateMap<WorkspaceInvitationParams> = {
  en: {
    render: ({ url, workspace_name, inviter_name, role, expires_in_days = 7 }) => {
      const roleLabel = roleName('en', role);
      const subject = `${inviter_name} invited you to ${workspace_name} on Sineva`;
      const text = [
        'Hello,',
        '',
        `${inviter_name} invited you to join ${workspace_name} on Sineva as ${roleLabel}.`,
        `Open the link below to accept (valid for ${expires_in_days} days):`,
        url,
        '',
        'Sign in or create your account with the email address this message was sent to. The link works only for that address.',
        'If you were not expecting this, you can ignore this email.',
        '',
        'Warm regards,',
        'The Sineva Team',
      ].join('\n');
      const html = page(`  <p>Hello,</p>
  <p>${escapeHtml(inviter_name)} invited you to join <strong>${escapeHtml(workspace_name)}</strong> on Sineva as ${escapeHtml(roleLabel)}.</p>
${button(url, 'Accept invitation')}
  <p style="font-size: 14px; color: #64748b;">This link is valid for ${expires_in_days} days and works only for the email address this message was sent to.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 32px;">If you were not expecting this, you can ignore this email.</p>`);
      return { subject, text, html };
    },
  },
  id: {
    render: ({ url, workspace_name, inviter_name, role, expires_in_days = 7 }) => {
      const roleLabel = roleName('id', role);
      const subject = `${inviter_name} mengundang kamu ke ${workspace_name} di Sineva`;
      const text = [
        'Halo,',
        '',
        `${inviter_name} mengundang kamu bergabung ke ${workspace_name} di Sineva sebagai ${roleLabel}.`,
        `Buka tautan berikut untuk menerima (berlaku selama ${expires_in_days} hari):`,
        url,
        '',
        'Masuk atau buat akun dengan alamat email yang menerima pesan ini. Tautan hanya berlaku untuk alamat itu.',
        'Kalau kamu tidak merasa diundang, abaikan saja email ini.',
        '',
        'Salam hangat,',
        'Tim Sineva',
      ].join('\n');
      const html = page(`  <p>Halo,</p>
  <p>${escapeHtml(inviter_name)} mengundang kamu bergabung ke <strong>${escapeHtml(workspace_name)}</strong> di Sineva sebagai ${escapeHtml(roleLabel)}.</p>
${button(url, 'Terima undangan')}
  <p style="font-size: 14px; color: #64748b;">Tautan ini berlaku selama ${expires_in_days} hari dan hanya untuk alamat email yang menerima pesan ini.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 32px;">Kalau kamu tidak merasa diundang, abaikan saja email ini.</p>`);
      return { subject, text, html };
    },
  },
};

export const ownershipTransferRequestTemplates: LocaleTemplateMap<OwnershipTransferRequestParams> = {
  en: {
    render: ({ url, recipient_name, workspace_name, from_name, expires_in_days = 7 }) => {
      const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
      const subject = `${from_name} wants to hand you ${workspace_name} on Sineva`;
      const text = [
        greeting,
        '',
        `${from_name} asked to transfer ownership of ${workspace_name} to you.`,
        'As the owner you control billing, members and the workspace itself. The current owner becomes an Admin.',
        `Open the link below to review and confirm (valid for ${expires_in_days} days):`,
        url,
        '',
        'Nothing changes until you confirm. If you do not want this, ignore the email.',
        '',
        'Warm regards,',
        'The Sineva Team',
      ].join('\n');
      const html = page(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(from_name)} asked to transfer ownership of <strong>${escapeHtml(workspace_name)}</strong> to you.</p>
  <p>As the owner you control billing, members and the workspace itself. The current owner becomes an Admin.</p>
${button(url, 'Review transfer')}
  <p style="font-size: 14px; color: #64748b;">This link is valid for ${expires_in_days} days. Nothing changes until you confirm.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>`);
      return { subject, text, html };
    },
  },
  id: {
    render: ({ url, recipient_name, workspace_name, from_name, expires_in_days = 7 }) => {
      const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
      const subject = `${from_name} ingin menyerahkan ${workspace_name} di Sineva kepadamu`;
      const text = [
        greeting,
        '',
        `${from_name} meminta untuk memindahkan kepemilikan ${workspace_name} kepadamu.`,
        'Sebagai pemilik, kamu mengatur tagihan, anggota, dan workspace itu sendiri. Pemilik saat ini menjadi Admin.',
        `Buka tautan berikut untuk meninjau dan mengonfirmasi (berlaku selama ${expires_in_days} hari):`,
        url,
        '',
        'Tidak ada yang berubah sampai kamu mengonfirmasi. Kalau kamu tidak mau, abaikan saja email ini.',
        '',
        'Salam hangat,',
        'Tim Sineva',
      ].join('\n');
      const html = page(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(from_name)} meminta untuk memindahkan kepemilikan <strong>${escapeHtml(workspace_name)}</strong> kepadamu.</p>
  <p>Sebagai pemilik, kamu mengatur tagihan, anggota, dan workspace itu sendiri. Pemilik saat ini menjadi Admin.</p>
${button(url, 'Tinjau pemindahan')}
  <p style="font-size: 14px; color: #64748b;">Tautan ini berlaku selama ${expires_in_days} hari. Tidak ada yang berubah sampai kamu mengonfirmasi.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>`);
      return { subject, text, html };
    },
  },
};

export const ownershipTransferredNoticeTemplates: LocaleTemplateMap<OwnershipTransferredNoticeParams> = {
  en: {
    render: ({ recipient_name, workspace_name, other_name, new_role }) => {
      const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
      const subject = `Ownership of ${workspace_name} moved`;
      const line =
        new_role === 'owner'
          ? `You are now the Owner of ${workspace_name}. ${other_name} is an Admin.`
          : `${other_name} is now the Owner of ${workspace_name}. You are an Admin.`;
      const text = [
        greeting,
        '',
        line,
        'If this was not expected, contact our support team right away.',
        '',
        'Warm regards,',
        'The Sineva Security Team',
      ].join('\n');
      const html = page(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(line)}</p>
  <p style="font-size: 14px; color: #64748b;">If this was not expected, contact our support team right away.</p>`);
      return { subject, text, html };
    },
  },
  id: {
    render: ({ recipient_name, workspace_name, other_name, new_role }) => {
      const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
      const subject = `Kepemilikan ${workspace_name} berpindah`;
      const line =
        new_role === 'owner'
          ? `Kamu sekarang menjadi Pemilik ${workspace_name}. ${other_name} menjadi Admin.`
          : `${other_name} sekarang menjadi Pemilik ${workspace_name}. Kamu menjadi Admin.`;
      const text = [
        greeting,
        '',
        line,
        'Kalau ini di luar dugaanmu, segera hubungi tim bantuan kami.',
        '',
        'Salam hangat,',
        'Tim Keamanan Sineva',
      ].join('\n');
      const html = page(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(line)}</p>
  <p style="font-size: 14px; color: #64748b;">Kalau ini di luar dugaanmu, segera hubungi tim bantuan kami.</p>`);
      return { subject, text, html };
    },
  },
};
