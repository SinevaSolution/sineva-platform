'use client';

import Link from 'next/link';
import * as React from 'react';
import { Button, buttonVariants } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { Field, FormAlert } from '@/client/components/ui/field';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';

const MIN_PASSWORD = 12;

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiRequest('/api/v1/auth/request-password-reset', {
        method: 'POST',
        body: { email: form.get('email') },
      });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    // Same message whether or not the account exists.
    return (
      <FormAlert tone="success">{t('forgot_password.sent')}</FormAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label={t('fields.email')} name="email" type="email" autoComplete="email" required autoFocus />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? t('forgot_password.submitting') : t('forgot_password.submit')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  if (!token) {
    return <FormAlert>{t('reset_password.incomplete')}</FormAlert>;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < MIN_PASSWORD) {
      setFieldError(t('sign_up.password_too_short', { min: MIN_PASSWORD }));
      return;
    }
    if (password !== form.get('confirm')) {
      setFieldError(t('reset_password.mismatch'));
      return;
    }
    setFieldError(null);
    setPending(true);
    setError(null);
    try {
      await apiRequest('/api/v1/auth/reset-password', {
        method: 'POST',
        body: { token, new_password: password },
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status >= 400 && err.status < 500
          ? t('reset_password.expired')
          : errorText(err),
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">{t('reset_password.done')}</FormAlert>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
          {t('reset_password.go_sign_in')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field
        label={t('fields.new_password')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        hint={t('sign_up.password_hint', { min: MIN_PASSWORD })}
        error={fieldError}
      />
      <Field label={t('fields.confirm_password')} name="confirm" type="password" autoComplete="new-password" required />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? t('reset_password.submitting') : t('reset_password.submit')}
      </Button>
    </form>
  );
}
