export type EmailLocale = 'en' | 'id';

export type EmailTemplateName =
  | 'verify_email'
  | 'reset_password'
  | 'lockout_notice'
  | 'email_change_confirm'
  | 'email_change_notice'
  | 'workspace_invitation'
  | 'ownership_transfer_request'
  | 'ownership_transferred_notice'
  | 'connection_needs_reconnect';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface VerifyEmailParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  url: string;
  recipient_name?: string;
  expires_in_minutes?: number;
}

export interface ResetPasswordParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  url: string;
  recipient_name?: string;
  expires_in_minutes?: number;
}

export interface LockoutNoticeParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  recipient_name?: string;
  lockout_duration_minutes: number;
  attempt_time?: string;
}

export interface EmailChangeConfirmParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  url: string;
  recipient_name?: string;
  new_email: string;
  expires_in_minutes?: number;
}

export interface EmailChangeNoticeParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  recipient_name?: string;
  new_email: string;
  revert_url?: string;
}

export interface WorkspaceInvitationParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  url: string;
  workspace_name: string;
  inviter_name: string;
  /** owner | admin | member | viewer; the template turns it into the localized role name. */
  role: string;
  expires_in_days?: number;
}

export interface OwnershipTransferRequestParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  url: string;
  recipient_name?: string;
  workspace_name: string;
  from_name: string;
  expires_in_days?: number;
}

export interface OwnershipTransferredNoticeParams {
  /** Origin of the app, for images in the email. Filled in by the sender; falls back to the link's origin. */
  app_url?: string;
  recipient_name?: string;
  workspace_name: string;
  /** The other party of the transfer. */
  other_name: string;
  /** The role this recipient holds now. */
  new_role: 'owner' | 'admin';
}

export interface ConnectionNeedsReconnectParams {
  recipient_name?: string;
  /** A proper name such as "Google Calendar". */
  provider_name: string;
  /** Link to the Connected tools page of the workspace. */
  url: string;
}

export type EmailParamsMap = {
  verify_email: VerifyEmailParams;
  reset_password: ResetPasswordParams;
  lockout_notice: LockoutNoticeParams;
  email_change_confirm: EmailChangeConfirmParams;
  email_change_notice: EmailChangeNoticeParams;
  workspace_invitation: WorkspaceInvitationParams;
  ownership_transfer_request: OwnershipTransferRequestParams;
  ownership_transferred_notice: OwnershipTransferredNoticeParams;
  connection_needs_reconnect: ConnectionNeedsReconnectParams;
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
