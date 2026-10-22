import type {
  EmailLocale,
  OwnershipTransferRequestParams,
  OwnershipTransferredNoticeParams,
  WorkspaceInvitationParams,
} from '@/server/domain/email/email_sender';
import type { LocaleTemplateMap } from './index';
import { renderLayout } from './layout';

// Invitation and ownership-transfer emails (WP-M1-28). The workspace, inviter
// and person names are user-controlled; the shared layout escapes every piece
// of text it is given, so nothing here builds HTML. The link is the only place
// a token ever appears.

const ROLE_NAMES: Record<EmailLocale, Record<string, string>> = {
  en: { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' },
  id: { owner: 'Pemilik', admin: 'Admin', member: 'Anggota', viewer: 'Peninjau' },
};

// What the role means, in plain words (never the permission names).
const ROLE_MEANING: Record<EmailLocale, Record<string, string>> = {
  en: {
    admin: 'As an Admin you can invite people and decide who has access.',
    member: 'As a Member you can work with Sino and the specialists you are given.',
    viewer: 'As a Viewer you can look at what your team shares, without changing it.',
    owner: 'As the Owner you look after the workspace, its people and its billing.',
  },
  id: {
    admin: 'Sebagai Admin, kamu bisa mengundang orang dan menentukan siapa yang punya akses.',
    member:
      'Sebagai Anggota, kamu bisa bekerja bersama Sino dan spesialis yang diberikan kepadamu.',
    viewer: 'Sebagai Peninjau, kamu bisa melihat apa yang dibagikan timmu, tanpa mengubahnya.',
    owner: 'Sebagai Pemilik, kamu mengurus workspace, orang-orangnya, dan tagihannya.',
  },
};

function roleName(locale: EmailLocale, role: string): string {
  return ROLE_NAMES[locale][role] ?? role;
}

function roleMeaning(locale: EmailLocale, role: string): string {
  return ROLE_MEANING[locale][role] ?? '';
}

const greeting = (locale: EmailLocale, name?: string) =>
  locale === 'en' ? (name ? `Hello ${name},` : 'Hello,') : name ? `Halo ${name},` : 'Halo,';

export const workspaceInvitationTemplates: LocaleTemplateMap<WorkspaceInvitationParams> = {
  en: {
    render: ({ url, workspace_name, inviter_name, role, expires_in_days = 7, app_url }) => {
      const roleLabel = roleName('en', role);
      const { html, text } = renderLayout({
        locale: 'en',
        appUrl: app_url,
        preheader: `${inviter_name} invited you to ${workspace_name}. It takes a minute to join.`,
        greeting: 'Hello,',
        heading: `${inviter_name} invited you to join ${workspace_name} on Sineva`,
        paragraphs: [
          [
            'Sineva gives your team Sino, a companion that helps with everyday work, and the specialists that come with it.',
          ],
          [`Your role: `, { strong: roleLabel }, `. ${roleMeaning('en', role)}`.trim()],
        ],
        button: { label: `Join ${workspace_name}`, url },
        linkLead: 'If the button does not work, paste this link into your browser:',
        notes: [
          `This invitation works for ${expires_in_days} days.`,
          'It only works for the email address this message was sent to. Sign in or create your account with that address.',
          'If you were not expecting this, you can ignore this email.',
        ],
        signoff: ['Warm regards,', 'The Sineva Team'],
        reason: `You are receiving this because ${inviter_name} entered your email address to invite you to a workspace on Sineva.`,
      });
      return {
        subject: `${inviter_name} invited you to join ${workspace_name} on Sineva`,
        text,
        html,
      };
    },
  },
  id: {
    render: ({ url, workspace_name, inviter_name, role, expires_in_days = 7, app_url }) => {
      const roleLabel = roleName('id', role);
      const { html, text } = renderLayout({
        locale: 'id',
        appUrl: app_url,
        preheader: `${inviter_name} mengundang kamu ke ${workspace_name}. Bergabungnya cuma semenit.`,
        greeting: 'Halo,',
        heading: `${inviter_name} mengundang kamu bergabung ke ${workspace_name} di Sineva`,
        paragraphs: [
          [
            'Sineva memberi timmu Sino, teman kerja yang membantu pekerjaan sehari-hari, lengkap dengan para spesialisnya.',
          ],
          [`Perananmu: `, { strong: roleLabel }, `. ${roleMeaning('id', role)}`.trim()],
        ],
        button: { label: `Gabung ke ${workspace_name}`, url },
        linkLead: 'Kalau tombolnya tidak bisa diklik, tempel tautan ini di peramban kamu:',
        notes: [
          `Undangan ini berlaku selama ${expires_in_days} hari.`,
          'Undangan hanya berlaku untuk alamat email yang menerima pesan ini. Masuk atau buat akun dengan alamat itu.',
          'Kalau kamu tidak merasa diundang, abaikan saja email ini.',
        ],
        signoff: ['Salam hangat,', 'Tim Sineva'],
        reason: `Kamu menerima ini karena ${inviter_name} memasukkan alamat emailmu untuk mengundang kamu ke sebuah workspace di Sineva.`,
      });
      return {
        subject: `${inviter_name} mengundang kamu bergabung ke ${workspace_name} di Sineva`,
        text,
        html,
      };
    },
  },
};

export const ownershipTransferRequestTemplates: LocaleTemplateMap<OwnershipTransferRequestParams> =
  {
    en: {
      render: ({
        url,
        recipient_name,
        workspace_name,
        from_name,
        expires_in_days = 7,
        app_url,
      }) => {
        const { html, text } = renderLayout({
          locale: 'en',
          appUrl: app_url,
          preheader: `${from_name} wants to hand ${workspace_name} over to you. Nothing changes until you confirm.`,
          greeting: greeting('en', recipient_name),
          heading: `${from_name} wants to hand you ${workspace_name}`,
          paragraphs: [
            [
              `${from_name} asked to transfer ownership of `,
              { strong: workspace_name },
              ' to you.',
            ],
            [
              'As the owner you look after billing, members and the workspace itself. The current owner becomes an Admin.',
            ],
          ],
          button: { label: 'Review transfer', url },
          linkLead: 'If the button does not work, paste this link into your browser:',
          notes: [
            `This link works for ${expires_in_days} days.`,
            'Nothing changes until you confirm. If you do not want this, ignore the email.',
          ],
          signoff: ['Warm regards,', 'The Sineva Team'],
          reason: 'You are receiving this because you are an Admin of this workspace on Sineva.',
        });
        return {
          subject: `${from_name} wants to hand you ${workspace_name} on Sineva`,
          text,
          html,
        };
      },
    },
    id: {
      render: ({
        url,
        recipient_name,
        workspace_name,
        from_name,
        expires_in_days = 7,
        app_url,
      }) => {
        const { html, text } = renderLayout({
          locale: 'id',
          appUrl: app_url,
          preheader: `${from_name} ingin menyerahkan ${workspace_name} kepadamu. Tidak ada yang berubah sampai kamu mengonfirmasi.`,
          greeting: greeting('id', recipient_name),
          heading: `${from_name} ingin menyerahkan ${workspace_name} kepadamu`,
          paragraphs: [
            [
              `${from_name} meminta untuk memindahkan kepemilikan `,
              { strong: workspace_name },
              ' kepadamu.',
            ],
            [
              'Sebagai pemilik, kamu mengurus tagihan, anggota, dan workspace itu sendiri. Pemilik saat ini menjadi Admin.',
            ],
          ],
          button: { label: 'Tinjau pemindahan', url },
          linkLead: 'Kalau tombolnya tidak bisa diklik, tempel tautan ini di peramban kamu:',
          notes: [
            `Tautan ini berlaku selama ${expires_in_days} hari.`,
            'Tidak ada yang berubah sampai kamu mengonfirmasi. Kalau kamu tidak mau, abaikan saja email ini.',
          ],
          signoff: ['Salam hangat,', 'Tim Sineva'],
          reason: 'Kamu menerima ini karena kamu adalah Admin di workspace ini di Sineva.',
        });
        return {
          subject: `${from_name} ingin menyerahkan ${workspace_name} di Sineva kepadamu`,
          text,
          html,
        };
      },
    },
  };

export const ownershipTransferredNoticeTemplates: LocaleTemplateMap<OwnershipTransferredNoticeParams> =
  {
    en: {
      render: ({ recipient_name, workspace_name, other_name, new_role, app_url }) => {
        const line =
          new_role === 'owner'
            ? `You are now the Owner of ${workspace_name}. ${other_name} is an Admin.`
            : `${other_name} is now the Owner of ${workspace_name}. You are an Admin.`;
        const { html, text } = renderLayout({
          locale: 'en',
          appUrl: app_url,
          preheader: line,
          greeting: greeting('en', recipient_name),
          heading: `Ownership of ${workspace_name} moved`,
          paragraphs: [[line]],
          notes: ['If this was not expected, contact our support team right away.'],
          signoff: ['Warm regards,', 'The Sineva Security Team'],
          reason:
            'You are receiving this notice because you are part of this ownership change on Sineva.',
        });
        return { subject: `Ownership of ${workspace_name} moved`, text, html };
      },
    },
    id: {
      render: ({ recipient_name, workspace_name, other_name, new_role, app_url }) => {
        const line =
          new_role === 'owner'
            ? `Kamu sekarang menjadi Pemilik ${workspace_name}. ${other_name} menjadi Admin.`
            : `${other_name} sekarang menjadi Pemilik ${workspace_name}. Kamu menjadi Admin.`;
        const { html, text } = renderLayout({
          locale: 'id',
          appUrl: app_url,
          preheader: line,
          greeting: greeting('id', recipient_name),
          heading: `Kepemilikan ${workspace_name} berpindah`,
          paragraphs: [[line]],
          notes: ['Kalau ini di luar dugaanmu, segera hubungi tim bantuan kami.'],
          signoff: ['Salam hangat,', 'Tim Keamanan Sineva'],
          reason:
            'Kamu menerima pemberitahuan ini karena kamu terlibat dalam perubahan kepemilikan ini di Sineva.',
        });
        return { subject: `Kepemilikan ${workspace_name} berpindah`, text, html };
      },
    },
  };
