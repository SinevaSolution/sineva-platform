import 'server-only';
import type {
  EmailSender,
  EmailSendOptions,
  EmailTemplateName,
  EmailTemplateRenderer,
  SentEmailRecord,
} from '@/server/domain/email/email_sender';

export class FakeEmailSender implements EmailSender {
  private sentEmails: SentEmailRecord[] = [];
  private processedIdempotencyKeys = new Set<string>();
  private renderer: EmailTemplateRenderer;

  constructor(renderer?: EmailTemplateRenderer) {
    this.renderer =
      renderer ??
      ((template) => ({
        subject: `[Sineva] ${template}`,
        text: `Content for ${template}`,
        html: `<p>Content for ${template}</p>`,
      }));
  }

  async send<T extends EmailTemplateName>(options: EmailSendOptions<T>): Promise<void> {
    if (options.idempotency_key) {
      if (this.processedIdempotencyKeys.has(options.idempotency_key)) {
        // Idempotent retry: do not re-send
        return;
      }
      this.processedIdempotencyKeys.add(options.idempotency_key);
    }

    const rendered = this.renderer(
      options.template,
      options.locale,
      options.params,
    );

    this.sentEmails.push({
      to: options.to,
      template: options.template,
      locale: options.locale,
      params: options.params as Record<string, unknown>,
      idempotency_key: options.idempotency_key,
      rendered,
      sent_at: new Date(),
    });
  }

  getSentEmails(): SentEmailRecord[] {
    return [...this.sentEmails];
  }

  getLastEmail(): SentEmailRecord | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clear(): void {
    this.sentEmails = [];
    this.processedIdempotencyKeys.clear();
  }
}
