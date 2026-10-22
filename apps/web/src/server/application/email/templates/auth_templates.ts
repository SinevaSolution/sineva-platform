import type {
  EmailChangeConfirmParams,
  EmailChangeNoticeParams,
  EmailLocale,
  LockoutNoticeParams,
  ResetPasswordParams,
  VerifyEmailParams,
} from '@/server/domain/email/email_sender';
import type { LocaleTemplateMap } from './index';
import { renderLayout } from './layout';

// Account emails: verify, reset, lockout, email change. They share the layout
// with the member emails (layout.ts). Verify and reset never mention a
// workspace: they go to people who may not belong to one yet.

const greeting = (locale: EmailLocale, name?: string) =>
  locale === 'en' ? (name ? `Hello ${name},` : 'Hello,') : name ? `Halo ${name},` : 'Halo,';

const LINK_LEAD: Record<EmailLocale, string> = {
  en: 'If the button does not work, paste this link into your browser:',
  id: 'Kalau tombolnya tidak bisa diklik, tempel tautan ini di peramban kamu:',
};

const TEAM: Record<EmailLocale, string[]> = {
  en: ['Warm regards,', 'The Sineva Team'],
  id: ['Salam hangat,', 'Tim Sineva'],
};

const SECURITY_TEAM: Record<EmailLocale, string[]> = {
  en: ['Warm regards,', 'The Sineva Security Team'],
  id: ['Salam hangat,', 'Tim Keamanan Sineva'],
};

export const verifyEmailTemplates: LocaleTemplateMap<VerifyEmailParams> = {
  en: {
    render: ({ url, recipient_name, expires_in_minutes = 30, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'en',
        appUrl: app_url,
        preheader: 'One tap to finish setting up your Sineva account.',
        greeting: greeting('en', recipient_name),
        heading: 'Confirm your email address',
        paragraphs: [
          [
            'Thanks for signing up. Confirm your email address to finish setting up your Sineva account.',
          ],
        ],
        button: { label: 'Verify email address', url },
        linkLead: LINK_LEAD.en,
        notes: [
          `This link works for ${expires_in_minutes} minutes.`,
          'If you did not create a Sineva account, you can ignore this email.',
        ],
        signoff: TEAM.en,
        reason: 'You are receiving this because this address was used to sign up for Sineva.',
      });
      return { subject: 'Verify your email for Sineva', text, html };
    },
  },
  id: {
    render: ({ url, recipient_name, expires_in_minutes = 30, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'id',
        appUrl: app_url,
        preheader: 'Satu ketukan lagi untuk menyelesaikan akun Sineva kamu.',
        greeting: greeting('id', recipient_name),
        heading: 'Konfirmasi alamat emailmu',
        paragraphs: [
          [
            'Terima kasih sudah mendaftar. Konfirmasi alamat emailmu untuk menyelesaikan akun Sineva kamu.',
          ],
        ],
        button: { label: 'Verifikasi alamat email', url },
        linkLead: LINK_LEAD.id,
        notes: [
          `Tautan ini berlaku selama ${expires_in_minutes} menit.`,
          'Kalau kamu tidak pernah mendaftar di Sineva, abaikan saja email ini.',
        ],
        signoff: TEAM.id,
        reason: 'Kamu menerima ini karena alamat email ini dipakai untuk mendaftar di Sineva.',
      });
      return { subject: 'Verifikasi email kamu untuk Sineva', text, html };
    },
  },
};

export const resetPasswordTemplates: LocaleTemplateMap<ResetPasswordParams> = {
  en: {
    render: ({ url, recipient_name, expires_in_minutes = 30, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'en',
        appUrl: app_url,
        preheader: 'Choose a new password for your Sineva account.',
        greeting: greeting('en', recipient_name),
        heading: 'Choose a new password',
        paragraphs: [
          [
            'We received a request to set a new password for your Sineva account. Use the button below to choose it.',
          ],
        ],
        button: { label: 'Choose a new password', url },
        linkLead: LINK_LEAD.en,
        notes: [
          `This link works for ${expires_in_minutes} minutes.`,
          'If you did not ask for this, ignore this email. Your password will not change.',
        ],
        signoff: TEAM.en,
        reason:
          'You are receiving this because a password link was requested for this address on Sineva.',
      });
      return { subject: 'Reset your Sineva password', text, html };
    },
  },
  id: {
    render: ({ url, recipient_name, expires_in_minutes = 30, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'id',
        appUrl: app_url,
        preheader: 'Pilih kata sandi baru untuk akun Sineva kamu.',
        greeting: greeting('id', recipient_name),
        heading: 'Pilih kata sandi baru',
        paragraphs: [
          [
            'Kami menerima permintaan untuk membuat kata sandi baru bagi akun Sineva kamu. Pakai tombol di bawah untuk memilihnya.',
          ],
        ],
        button: { label: 'Pilih kata sandi baru', url },
        linkLead: LINK_LEAD.id,
        notes: [
          `Tautan ini berlaku selama ${expires_in_minutes} menit.`,
          'Kalau kamu tidak memintanya, abaikan saja email ini. Kata sandimu tidak berubah.',
        ],
        signoff: TEAM.id,
        reason:
          'Kamu menerima ini karena ada permintaan tautan kata sandi untuk alamat ini di Sineva.',
      });
      return { subject: 'Atur ulang kata sandi Sineva kamu', text, html };
    },
  },
};

export const lockoutNoticeTemplates: LocaleTemplateMap<LockoutNoticeParams> = {
  en: {
    render: ({ recipient_name, lockout_duration_minutes, attempt_time, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'en',
        appUrl: app_url,
        preheader: `Your account unlocks by itself in ${lockout_duration_minutes} minutes.`,
        greeting: greeting('en', recipient_name),
        heading: 'Your account is locked for a moment',
        paragraphs: [
          [
            'For your security, we locked your Sineva account after 5 failed sign-in attempts in a row.',
          ],
          ['It unlocks by itself in ', { strong: `${lockout_duration_minutes} minutes` }, '.'],
          [
            'If this was not you, someone may be trying to get into your account. Reset your password once the lock ends.',
          ],
        ],
        notes: attempt_time ? [`Last attempt: ${attempt_time}`] : [],
        signoff: SECURITY_TEAM.en,
        reason:
          'You are receiving this security notice because of sign-in attempts on your Sineva account.',
      });
      return { subject: 'Security alert: Your Sineva account is temporarily locked', text, html };
    },
  },
  id: {
    render: ({ recipient_name, lockout_duration_minutes, attempt_time, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'id',
        appUrl: app_url,
        preheader: `Akunmu terbuka sendiri dalam ${lockout_duration_minutes} menit.`,
        greeting: greeting('id', recipient_name),
        heading: 'Akunmu dikunci sebentar',
        paragraphs: [
          [
            'Demi keamanan, kami mengunci akun Sineva kamu setelah 5 kali percobaan masuk yang gagal berturut-turut.',
          ],
          ['Akunmu terbuka sendiri dalam ', { strong: `${lockout_duration_minutes} menit` }, '.'],
          [
            'Kalau itu bukan kamu, mungkin ada orang yang mencoba masuk ke akunmu. Atur ulang kata sandimu setelah masa kunci berakhir.',
          ],
        ],
        notes: attempt_time ? [`Percobaan terakhir: ${attempt_time}`] : [],
        signoff: SECURITY_TEAM.id,
        reason:
          'Kamu menerima pemberitahuan keamanan ini karena ada percobaan masuk ke akun Sineva kamu.',
      });
      return { subject: 'Peringatan keamanan: Akun Sineva kamu terkunci sementara', text, html };
    },
  },
};

export const emailChangeConfirmTemplates: LocaleTemplateMap<EmailChangeConfirmParams> = {
  en: {
    render: ({ url, recipient_name, new_email, expires_in_minutes = 30, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'en',
        appUrl: app_url,
        preheader: 'Confirm the new email address for your Sineva account.',
        greeting: greeting('en', recipient_name),
        heading: 'Confirm your new email address',
        paragraphs: [
          [
            'You asked to change the email address of your Sineva account to ',
            { strong: new_email },
            '.',
          ],
        ],
        button: { label: 'Confirm new email address', url },
        linkLead: LINK_LEAD.en,
        notes: [
          `This link works for ${expires_in_minutes} minutes.`,
          'If you did not ask for this change, contact our support team right away.',
        ],
        signoff: TEAM.en,
        reason:
          'You are receiving this because a new email address was entered for a Sineva account.',
      });
      return { subject: 'Confirm your new email address for Sineva', text, html };
    },
  },
  id: {
    render: ({ url, recipient_name, new_email, expires_in_minutes = 30, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'id',
        appUrl: app_url,
        preheader: 'Konfirmasi alamat email baru untuk akun Sineva kamu.',
        greeting: greeting('id', recipient_name),
        heading: 'Konfirmasi alamat email barumu',
        paragraphs: [
          [
            'Kamu meminta untuk mengubah alamat email akun Sineva kamu menjadi ',
            { strong: new_email },
            '.',
          ],
        ],
        button: { label: 'Konfirmasi alamat email baru', url },
        linkLead: LINK_LEAD.id,
        notes: [
          `Tautan ini berlaku selama ${expires_in_minutes} menit.`,
          'Kalau kamu tidak meminta perubahan ini, segera hubungi tim bantuan kami.',
        ],
        signoff: TEAM.id,
        reason: 'Kamu menerima ini karena ada alamat email baru yang dimasukkan untuk akun Sineva.',
      });
      return { subject: 'Konfirmasi alamat email baru kamu untuk Sineva', text, html };
    },
  },
};

export const emailChangeNoticeTemplates: LocaleTemplateMap<EmailChangeNoticeParams> = {
  en: {
    render: ({ recipient_name, new_email, revert_url, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'en',
        appUrl: app_url ?? revert_url,
        preheader: 'The email address of your Sineva account is being changed.',
        greeting: greeting('en', recipient_name),
        heading: 'Your account email is being changed',
        paragraphs: [
          [
            'The email address of your Sineva account is being changed to ',
            { strong: new_email },
            '.',
          ],
          ['If you started this change, you do not need to do anything.'],
        ],
        button: revert_url
          ? { label: 'Secure my account', url: revert_url, tone: 'alert' }
          : undefined,
        linkLead: LINK_LEAD.en,
        notes: revert_url
          ? []
          : ['If this was not you, contact our support team right away to protect your account.'],
        signoff: SECURITY_TEAM.en,
        reason:
          'You are receiving this security notice because it concerns the account tied to this address.',
      });
      return { subject: 'Notice: Your Sineva account email was updated', text, html };
    },
  },
  id: {
    render: ({ recipient_name, new_email, revert_url, app_url }) => {
      const { html, text } = renderLayout({
        locale: 'id',
        appUrl: app_url ?? revert_url,
        preheader: 'Alamat email akun Sineva kamu sedang diubah.',
        greeting: greeting('id', recipient_name),
        heading: 'Email akunmu sedang diubah',
        paragraphs: [
          ['Alamat email akun Sineva kamu sedang diubah menjadi ', { strong: new_email }, '.'],
          ['Kalau kamu yang memulai perubahan ini, kamu tidak perlu melakukan apa pun.'],
        ],
        button: revert_url
          ? { label: 'Amankan akunku', url: revert_url, tone: 'alert' }
          : undefined,
        linkLead: LINK_LEAD.id,
        notes: revert_url
          ? []
          : ['Kalau itu bukan kamu, segera hubungi tim bantuan kami untuk mengamankan akunmu.'],
        signoff: SECURITY_TEAM.id,
        reason:
          'Kamu menerima pemberitahuan keamanan ini karena menyangkut akun yang terhubung ke alamat ini.',
      });
      return {
        subject: 'Pemberitahuan: Alamat email akun Sineva kamu telah diperbarui',
        text,
        html,
      };
    },
  },
};
