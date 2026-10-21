import { validatePassword } from '@/server/domain/auth/password_policy';
import type { BreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { createAnonymousRequestContext } from '@/server/domain/context/request_context';

export interface SignUpInput {
  email: string;
  password: string;
  full_name: string;
  terms_accepted_version: string;
  privacy_accepted_version: string;
  marketing_opt_in?: boolean;
  locale?: string;
  timezone?: string;
}

export interface AuthService {
  signUp(params: {
    email: string;
    password: string;
    name: string;
    locale: string;
    timezone: string;
    terms_accepted_version: string;
    terms_accepted_at: Date;
    privacy_accepted_version: string;
    privacy_accepted_at: Date;
    marketing_opt_in: boolean;
  }): Promise<{ user: { id: string; email: string; name: string } }>;
}

export class SignUpUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly breachedChecker: BreachedPasswordChecker,
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: SignUpInput): Promise<{ user: { id: string; email: string; name: string } }> {
    // 1. Password policy check
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.valid) {
      throw new ValidationError(passwordCheck.reason ?? 'Invalid password', [
        { code: 'invalid_password', field: 'password', detail: passwordCheck.reason ?? '' },
      ]);
    }

    // 2. Breached password check
    const isBreached = await this.breachedChecker.isBreached(input.password);
    if (isBreached) {
      throw new ValidationError(
        'This password has appeared in a data breach. Please choose a different password for your security.',
        [
          {
            code: 'breached_password',
            field: 'password',
            detail: 'This password has appeared in a data breach.',
          },
        ],
      );
    }

    // 3. Terms & Privacy consent check
    if (!input.terms_accepted_version || input.terms_accepted_version.trim().length === 0) {
      throw new ValidationError('You must accept the terms of service to create an account.', [
        {
          code: 'terms_required',
          field: 'terms_accepted_version',
          detail: 'Terms acceptance version is required',
        },
      ]);
    }

    if (!input.privacy_accepted_version || input.privacy_accepted_version.trim().length === 0) {
      throw new ValidationError('You must accept the privacy policy to create an account.', [
        {
          code: 'privacy_required',
          field: 'privacy_accepted_version',
          detail: 'Privacy acceptance version is required',
        },
      ]);
    }

    const now = new Date();
    const result = await this.authService.signUp({
      email: input.email.toLowerCase().trim(),
      password: input.password,
      name: input.full_name.trim(),
      locale: input.locale ?? 'id',
      timezone: input.timezone ?? 'Asia/Jakarta',
      terms_accepted_version: input.terms_accepted_version,
      terms_accepted_at: now,
      privacy_accepted_version: input.privacy_accepted_version,
      privacy_accepted_at: now,
      marketing_opt_in: Boolean(input.marketing_opt_in),
    });

    // 4. Audit event
    await this.auditLogger.log({
      action: 'user.signed_up',
      context: {
        ...createAnonymousRequestContext('auth-signup'),
        user_id: result.user.id,
      },
      target_resource_id: result.user.id,
      target_resource_type: 'user',
      metadata: {
        email: input.email.toLowerCase().trim(),
      },
    });

    return result;
  }
}
