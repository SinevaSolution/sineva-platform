export type EmailLocale = 'en' | 'id';

export type EmailTemplateName =
  | 'verify_email'
  | 'reset_password'
  | 'lockout_notice'
  | 'email_change_confirm'
  | 'email_change_notice';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface VerifyEmailParams {
  url: string;
  recipient_name?: string;
  expires_in_minutes?: number;
}

export interface ResetPasswordParams {
  url: string;
  recipient_name?: string;
  expires_in_minutes?: number;
}

export interface LockoutNoticeParams {
  recipient_name?: string;
  lockout_duration_minutes: number;
  attempt_time?: string;
}

export interface EmailChangeConfirmParams {
  url: string;
  recipient_name?: string;
  new_email: string;
  expires_in_minutes?: number;
}

export interface EmailChangeNoticeParams {
  recipient_name?: string;
  new_email: string;
  revert_url?: string;
}

export type EmailParamsMap = {
  verify_email: VerifyEmailParams;
  reset_password: ResetPasswordParams;
  lockout_notice: LockoutNoticeParams;
  email_change_confirm: EmailChangeConfirmParams;
  email_change_notice: EmailChangeNoticeParams;
};

export interface EmailSendOptions<T extends EmailTemplateName = EmailTemplateName> {
  to: string;
  template: T;
  locale: EmailLocale;
  params: EmailParamsMap[T] | Record<string, unknown>;
  idempotency_key?: string;
}

export interface SentEmailRecord {
  to: string;
  template: EmailTemplateName;
  locale: EmailLocale;
  params: Record<string, unknown>;
  idempotency_key?: string;
  rendered: RenderedEmail;
  sent_at: Date;
}

export type EmailTemplateRenderer = <T extends EmailTemplateName>(
  template: T,
  locale: EmailLocale,
  params: EmailParamsMap[T] | Record<string, unknown>,
) => RenderedEmail;

/**
 * Port for transactional email delivery.
 * Implementations: SmtpEmailSender, FakeEmailSender (tests).
 */
export interface EmailSender {
  send<T extends EmailTemplateName>(options: EmailSendOptions<T>): Promise<void>;
}
