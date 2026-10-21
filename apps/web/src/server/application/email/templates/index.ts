import type {
  EmailLocale,
  EmailParamsMap,
  EmailTemplateName,
  RenderedEmail,
  VerifyEmailParams,
  ResetPasswordParams,
  LockoutNoticeParams,
  EmailChangeConfirmParams,
  EmailChangeNoticeParams,
} from '@/server/domain/email/email_sender';

export type { EmailLocale, EmailTemplateName, RenderedEmail };

export interface EmailTemplateDefinition<TParams> {
  render(params: TParams): RenderedEmail;
}

export type LocaleTemplateMap<TParams> = Record<EmailLocale, EmailTemplateDefinition<TParams>>;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 1. VERIFY EMAIL
const verifyEmailEn: EmailTemplateDefinition<VerifyEmailParams> = {
  render: ({ url, recipient_name, expires_in_minutes = 30 }) => {
    const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
    const subject = 'Verify your email for Sineva';
    const text = [
      greeting,
      '',
      'Please verify your email address to complete your Sineva account setup.',
      `Click the link below to verify (valid for ${expires_in_minutes} minutes):`,
      url,
      '',
      'If you did not create a Sineva account, you can safely ignore this email.',
      '',
      'Warm regards,',
      'The Sineva Team',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>Please verify your email address to complete your Sineva account setup.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      Verify Email Address
    </a>
  </p>
  <p style="font-size: 14px; color: #64748b;">This link will expire in ${expires_in_minutes} minutes.</p>
  <p style="font-size: 14px; color: #64748b;">If you cannot click the button, copy and paste this link into your browser:</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 32px;">If you did not create a Sineva account, you can safely ignore this email.</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

const verifyEmailId: EmailTemplateDefinition<VerifyEmailParams> = {
  render: ({ url, recipient_name, expires_in_minutes = 30 }) => {
    const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
    const subject = 'Verifikasi email kamu untuk Sineva';
    const text = [
      greeting,
      '',
      'Yuk verifikasi alamat email kamu untuk menyelesaikan pendaftaran akun Sineva.',
      `Klik tautan berikut untuk memverifikasi (berlaku selama ${expires_in_minutes} menit):`,
      url,
      '',
      'Jika kamu tidak pernah mendaftar di Sineva, abaikan saja email ini.',
      '',
      'Salam hangat,',
      'Tim Sineva',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>Yuk verifikasi alamat email kamu untuk menyelesaikan pendaftaran akun Sineva.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      Verifikasi Alamat Email
    </a>
  </p>
  <p style="font-size: 14px; color: #64748b;">Tautan ini berlaku selama ${expires_in_minutes} menit.</p>
  <p style="font-size: 14px; color: #64748b;">Jika tombol di atas tidak dapat diklik, salin dan tempel tautan berikut ke peramban kamu:</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 32px;">Jika kamu tidak pernah mendaftar di Sineva, abaikan saja email ini.</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

// 2. RESET PASSWORD
const resetPasswordEn: EmailTemplateDefinition<ResetPasswordParams> = {
  render: ({ url, recipient_name, expires_in_minutes = 30 }) => {
    const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
    const subject = 'Reset your Sineva password';
    const text = [
      greeting,
      '',
      'We received a request to reset your password for your Sineva account.',
      `Click the link below to set a new password (valid for ${expires_in_minutes} minutes):`,
      url,
      '',
      'If you did not request a password reset, you can safely ignore this email. Your password will not change.',
      '',
      'Warm regards,',
      'The Sineva Team',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>We received a request to reset your password for your Sineva account.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      Reset Password
    </a>
  </p>
  <p style="font-size: 14px; color: #64748b;">This link will expire in ${expires_in_minutes} minutes.</p>
  <p style="font-size: 14px; color: #64748b;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

const resetPasswordId: EmailTemplateDefinition<ResetPasswordParams> = {
  render: ({ url, recipient_name, expires_in_minutes = 30 }) => {
    const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
    const subject = 'Atur ulang kata sandi Sineva kamu';
    const text = [
      greeting,
      '',
      'Kami menerima permintaan untuk mengatur ulang kata sandi akun Sineva kamu.',
      `Klik tautan berikut untuk membuat kata sandi baru (berlaku selama ${expires_in_minutes} menit):`,
      url,
      '',
      'Jika kamu tidak pernah meminta reset kata sandi, abaikan saja email ini. Kata sandi akun kamu tetap aman dan tidak berubah.',
      '',
      'Salam hangat,',
      'Tim Sineva',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Sineva kamu.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      Atur Ulang Kata Sandi
    </a>
  </p>
  <p style="font-size: 14px; color: #64748b;">Tautan ini berlaku selama ${expires_in_minutes} menit.</p>
  <p style="font-size: 14px; color: #64748b;">Jika kamu tidak pernah meminta reset kata sandi, abaikan saja email ini. Kata sandi akun kamu tetap aman dan tidak berubah.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

// 3. LOCKOUT NOTICE
const lockoutNoticeEn: EmailTemplateDefinition<LockoutNoticeParams> = {
  render: ({ recipient_name, lockout_duration_minutes, attempt_time }) => {
    const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
    const subject = 'Security alert: Your Sineva account is temporarily locked';
    const text = [
      greeting,
      '',
      'For your security, your Sineva account has been temporarily locked after 5 consecutive failed login attempts.',
      `Your account will be automatically unlocked in ${lockout_duration_minutes} minutes.`,
      attempt_time ? `Last attempt recorded at: ${attempt_time}` : '',
      '',
      'If you did not perform these attempts, someone may be trying to access your account. We recommend resetting your password once the lockout expires.',
      '',
      'Warm regards,',
      'The Sineva Security Team',
    ]
      .filter(Boolean)
      .join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p><strong>Security notice:</strong> For your security, your Sineva account has been temporarily locked after 5 consecutive failed login attempts.</p>
  <p>Your account will be automatically unlocked in <strong>${lockout_duration_minutes} minutes</strong>.</p>
  ${attempt_time ? `<p style="font-size: 14px; color: #64748b;">Last attempt recorded at: ${escapeHtml(attempt_time)}</p>` : ''}
  <p style="font-size: 14px; color: #64748b;">If you did not perform these attempts, someone may be trying to access your account. We recommend resetting your password once the lockout expires.</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

const lockoutNoticeId: EmailTemplateDefinition<LockoutNoticeParams> = {
  render: ({ recipient_name, lockout_duration_minutes, attempt_time }) => {
    const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
    const subject = 'Peringatan keamanan: Akun Sineva kamu terkunci sementara';
    const text = [
      greeting,
      '',
      'Demi keamanan akun kamu, akun Sineva kamu telah dikunci sementara setelah 5 kali percobaan masuk yang gagal berturut-turut.',
      `Akun kamu akan terbuka secara otomatis dalam ${lockout_duration_minutes} menit.`,
      attempt_time ? `Percobaan terakhir tercatat pada: ${attempt_time}` : '',
      '',
      'Jika bukan kamu yang melakukan percobaan ini, kemungkinan ada pihak lain yang mencoba mengakses akunmu. Kami sarankan untuk mengatur ulang kata sandi setelah masa kunci berakhir.',
      '',
      'Salam hangat,',
      'Tim Keamanan Sineva',
    ]
      .filter(Boolean)
      .join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p><strong>Pemberitahuan keamanan:</strong> Demi keamanan akun kamu, akun Sineva kamu telah dikunci sementara setelah 5 kali percobaan masuk yang gagal berturut-turut.</p>
  <p>Akun kamu akan terbuka secara otomatis dalam <strong>${lockout_duration_minutes} menit</strong>.</p>
  ${attempt_time ? `<p style="font-size: 14px; color: #64748b;">Percobaan terakhir tercatat pada: ${escapeHtml(attempt_time)}</p>` : ''}
  <p style="font-size: 14px; color: #64748b;">Jika bukan kamu yang melakukan percobaan ini, kami sarankan untuk mengatur ulang kata sandi setelah masa kunci berakhir.</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

// 4. EMAIL CHANGE CONFIRM (Sent to the NEW email address)
const emailChangeConfirmEn: EmailTemplateDefinition<EmailChangeConfirmParams> = {
  render: ({ url, recipient_name, new_email, expires_in_minutes = 30 }) => {
    const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
    const subject = 'Confirm your new email address for Sineva';
    const text = [
      greeting,
      '',
      `You requested to change your Sineva account email address to ${new_email}.`,
      `Please click the link below to confirm this change (valid for ${expires_in_minutes} minutes):`,
      url,
      '',
      'If you did not request this change, please contact our support team immediately.',
      '',
      'Warm regards,',
      'The Sineva Team',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>You requested to change your Sineva account email address to <strong>${escapeHtml(new_email)}</strong>.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      Confirm New Email Address
    </a>
  </p>
  <p style="font-size: 14px; color: #64748b;">This link will expire in ${expires_in_minutes} minutes.</p>
  <p style="font-size: 14px; color: #64748b;">If you did not request this change, please contact our support team immediately.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

const emailChangeConfirmId: EmailTemplateDefinition<EmailChangeConfirmParams> = {
  render: ({ url, recipient_name, new_email, expires_in_minutes = 30 }) => {
    const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
    const subject = 'Konfirmasi alamat email baru kamu untuk Sineva';
    const text = [
      greeting,
      '',
      `Kamu meminta untuk mengubah alamat email akun Sineva kamu menjadi ${new_email}.`,
      `Klik tautan berikut untuk mengonfirmasi perubahan ini (berlaku selama ${expires_in_minutes} menit):`,
      url,
      '',
      'Jika kamu tidak pernah meminta perubahan ini, segera hubungi tim bantuan kami.',
      '',
      'Salam hangat,',
      'Tim Sineva',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>Kamu meminta untuk mengubah alamat email akun Sineva kamu menjadi <strong>${escapeHtml(new_email)}</strong>.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      Konfirmasi Alamat Email Baru
    </a>
  </p>
  <p style="font-size: 14px; color: #64748b;">Tautan ini berlaku selama ${expires_in_minutes} menit.</p>
  <p style="font-size: 14px; color: #64748b;">Jika kamu tidak pernah meminta perubahan ini, segera hubungi tim bantuan kami.</p>
  <p style="font-size: 14px; word-break: break-all; color: #0d9488;">${escapeHtml(url)}</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

// 5. EMAIL CHANGE NOTICE (Sent to the OLD email address)
const emailChangeNoticeEn: EmailTemplateDefinition<EmailChangeNoticeParams> = {
  render: ({ recipient_name, new_email, revert_url }) => {
    const greeting = recipient_name ? `Hello ${recipient_name},` : 'Hello,';
    const subject = 'Notice: Your Sineva account email was updated';
    const text = [
      greeting,
      '',
      `Your Sineva account email address is in the process of being changed to ${new_email}.`,
      revert_url
        ? `If you did not initiate this change, visit this link immediately to protect your account:\n${revert_url}`
        : 'If you did not initiate this change, please contact our support team immediately to protect your account.',
      '',
      'Warm regards,',
      'The Sineva Security Team',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>Your Sineva account email address is in the process of being changed to <strong>${escapeHtml(new_email)}</strong>.</p>
  ${
    revert_url
      ? `<p style="margin: 24px 0;"><a href="${escapeHtml(revert_url)}" style="background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Secure My Account</a></p>`
      : ''
  }
  <p style="font-size: 14px; color: #64748b;">If you did not initiate this change, please contact our support team immediately to protect your account.</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

const emailChangeNoticeId: EmailTemplateDefinition<EmailChangeNoticeParams> = {
  render: ({ recipient_name, new_email, revert_url }) => {
    const greeting = recipient_name ? `Halo ${recipient_name},` : 'Halo,';
    const subject = 'Pemberitahuan: Alamat email akun Sineva kamu telah diperbarui';
    const text = [
      greeting,
      '',
      `Alamat email akun Sineva kamu sedang dalam proses diubah menjadi ${new_email}.`,
      revert_url
        ? `Jika kamu tidak merasa melakukan perubahan ini, buka tautan berikut untuk mengamankan akunmu:\n${revert_url}`
        : 'Jika kamu tidak merasa melakukan perubahan ini, segera hubungi tim bantuan kami untuk mengamankan akunmu.',
      '',
      'Salam hangat,',
      'Tim Keamanan Sineva',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${escapeHtml(greeting)}</p>
  <p>Alamat email akun Sineva kamu sedang dalam proses diubah menjadi <strong>${escapeHtml(new_email)}</strong>.</p>
  ${
    revert_url
      ? `<p style="margin: 24px 0;"><a href="${escapeHtml(revert_url)}" style="background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Amankan Akun Saya</a></p>`
      : ''
  }
  <p style="font-size: 14px; color: #64748b;">Jika kamu tidak merasa melakukan perubahan ini, segera hubungi tim bantuan kami untuk mengamankan akunmu.</p>
</body>
</html>`;

    return { subject, text, html };
  },
};

export const EMAIL_TEMPLATES: {
  [K in EmailTemplateName]: LocaleTemplateMap<EmailParamsMap[K]>;
} = {
  verify_email: {
    en: verifyEmailEn,
    id: verifyEmailId,
  },
  reset_password: {
    en: resetPasswordEn,
    id: resetPasswordId,
  },
  lockout_notice: {
    en: lockoutNoticeEn,
    id: lockoutNoticeId,
  },
  email_change_confirm: {
    en: emailChangeConfirmEn,
    id: emailChangeConfirmId,
  },
  email_change_notice: {
    en: emailChangeNoticeEn,
    id: emailChangeNoticeId,
  },
};

export function renderEmailTemplate<K extends EmailTemplateName>(
  template: K,
  locale: EmailLocale,
  params: EmailParamsMap[K] | Record<string, unknown>,
): RenderedEmail {
  const templateGroup = EMAIL_TEMPLATES[template];
  if (!templateGroup) {
    throw new Error(`Unknown email template: '${template}'`);
  }

  const localeRenderer = templateGroup[locale] ?? templateGroup.en;
  if (!localeRenderer) {
    throw new Error(`Template '${template}' has no renderer for locale '${locale}' or fallback 'en'`);
  }

  // Cast safely to expected param type
  return (localeRenderer.render as (p: unknown) => RenderedEmail)(params);
}
