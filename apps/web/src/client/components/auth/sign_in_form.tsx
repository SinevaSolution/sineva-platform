'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import { SNBanner, SNButton, SNField, SNInput } from '@sineva/ui';

export function SignInForm({
  initialError,
  redirectTo = '/',
}: {
  initialError?: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const t = useTranslations('auth');
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError ?? null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiRequest('/api/v1/auth/sign-in', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      // One message for unknown email and wrong password, so the form never
      // reveals which accounts exist.
      const passthrough = err instanceof ApiError && (err.status === 429 || err.status === 0);
      setError(passthrough ? errorText(err) : t('sign_in.bad_credentials'));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <SNField label={t('fields.email')} required>
        <SNInput name="email" type="email" autoComplete="email" autoFocus />
      </SNField>
      <SNField
        label={t('fields.password')}
        required
        trailing={
          <Link href="/forgot-password" className="text-[13px] text-text-brand underline-offset-4 hover:underline">
            {t('sign_in.forgot_link')}
          </Link>
        }
      >
        <SNInput name="password" type="password" autoComplete="current-password" />
      </SNField>
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      <SNButton type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? t('sign_in.submitting') : t('sign_in.submit')}
      </SNButton>
    </form>
  );
}
