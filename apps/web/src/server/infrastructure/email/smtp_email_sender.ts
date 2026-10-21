import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  EmailSender,
  EmailSendOptions,
  EmailTemplateName,
  EmailTemplateRenderer,
} from '@/server/domain/email/email_sender';
import { DependencyUnavailableError } from '@/server/domain/errors/domain_error';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  password?: string;
  from: string;
  connectionTimeoutMs?: number;
  renderer?: EmailTemplateRenderer;
}

export class SmtpEmailSender implements EmailSender {
  private transporter: Transporter;
  private from: string;
  private renderer: EmailTemplateRenderer;
  private processedIdempotencyKeys = new Set<string>();

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.renderer =
      config.renderer ??
      ((template) => ({
        subject: `[Sineva] ${template}`,
        text: `Content for ${template}`,
        html: `<p>Content for ${template}</p>`,
      }));

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth:
        config.user && config.password
          ? {
              user: config.user,
              pass: config.password,
            }
          : undefined,
      connectionTimeout: config.connectionTimeoutMs ?? 5000,
      greetingTimeout: config.connectionTimeoutMs ?? 5000,
      socketTimeout: config.connectionTimeoutMs ?? 5000,
    });
  }

  async send<T extends EmailTemplateName>(options: EmailSendOptions<T>): Promise<void> {
    if (options.idempotency_key) {
      if (this.processedIdempotencyKeys.has(options.idempotency_key)) {
        return;
      }
      this.processedIdempotencyKeys.add(options.idempotency_key);
    }

    const rendered = this.renderer(
      options.template,
      options.locale,
      options.params,
    );

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (err) {
      console.error(
        '[email-error] Failed to send transactional email',
        err instanceof Error ? err.message : String(err),
      );
      throw new DependencyUnavailableError(
        'The email delivery service is currently unavailable. Please try again later.',
      );
    }
  }
}
