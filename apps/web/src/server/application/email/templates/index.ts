import type {
  EmailLocale,
  EmailParamsMap,
  EmailTemplateName,
  RenderedEmail,
} from '@/server/domain/email/email_sender';
import { connectionNeedsReconnectTemplates } from './connections';
import {
  emailChangeConfirmTemplates,
  emailChangeNoticeTemplates,
  lockoutNoticeTemplates,
  resetPasswordTemplates,
  verifyEmailTemplates,
} from './auth_templates';
import {
  ownershipTransferRequestTemplates,
  ownershipTransferredNoticeTemplates,
  workspaceInvitationTemplates,
} from './members';

export type { EmailLocale, EmailTemplateName, RenderedEmail };

export interface EmailTemplateDefinition<TParams> {
  render(params: TParams): RenderedEmail;
}

export type LocaleTemplateMap<TParams> = Record<EmailLocale, EmailTemplateDefinition<TParams>>;

export const EMAIL_TEMPLATES: {
  [K in EmailTemplateName]: LocaleTemplateMap<EmailParamsMap[K]>;
} = {
  verify_email: verifyEmailTemplates,
  reset_password: resetPasswordTemplates,
  lockout_notice: lockoutNoticeTemplates,
  email_change_confirm: emailChangeConfirmTemplates,
  email_change_notice: emailChangeNoticeTemplates,
  workspace_invitation: workspaceInvitationTemplates,
  ownership_transfer_request: ownershipTransferRequestTemplates,
  ownership_transferred_notice: ownershipTransferredNoticeTemplates,
  connection_needs_reconnect: connectionNeedsReconnectTemplates,
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
    throw new Error(
      `Template '${template}' has no renderer for locale '${locale}' or fallback 'en'`,
    );
  }

  // Cast safely to expected param type
  return (localeRenderer.render as (p: unknown) => RenderedEmail)(params);
}
