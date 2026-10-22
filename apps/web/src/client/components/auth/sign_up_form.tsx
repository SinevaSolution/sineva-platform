'use client';

import * as React from 'react';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import { SNBanner, SNButton, SNField, SNInput } from '@sineva/ui';

// Placeholder versions until Legal publishes the terms (decision D-M0-4).
const TERMS_VERSION = '2026-10-draft';
const PRIVACY_VERSION = '2026-10-draft';
const MIN_PASSWORD = 12;

export function SignUpForm() {
  const t = useTranslations('auth');
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < MIN_PASSWORD) {
      setPasswordError(t('sign_up.password_too_short', { min: MIN_PASSWORD }));
      return;
    }
    if (!form.get('consent')) {
      setError(t('sign_up.consent_required'));
      return;
    }
    setPasswordError(null);
    setError(null);
    setPending(true);
    try {
      const email = String(form.get('email') ?? '');
      await apiRequest('/api/v1/auth/sign-up', {
        method: 'POST',
        body: {
          full_name: form.get('full_name'),
          email,
          password,
          terms_accepted_version: TERMS_VERSION,
          privacy_accepted_version: PRIVACY_VERSION,
          marketing_opt_in: form.get('marketing') === 'on',
          locale: navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setSentTo(email);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <SNBanner tone="success">
        {t.rich('sign_up.sent', { email: <strong className="font-semibold">{sentTo}</strong> })}
      </SNBanner>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <SNField label={t('fields.full_name')} required>
        <SNInput name="full_name" autoComplete="name" autoFocus maxLength={100} />
      </SNField>
      <SNField label={t('fields.work_email')} required>
        <SNInput name="email" type="email" autoComplete="email" />
      </SNField>
      <SNField
        label={t('fields.password')}
        required
        hint={t('sign_up.password_hint', { min: MIN_PASSWORD })}
        error={passwordError}
      >
        <SNInput name="password" type="password" autoComplete="new-password" />
      </SNField>
      <div className="space-y-2.5 pt-1 text-[13px] text-text-secondary">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-[var(--color-action-primary)]" />
          <span>{t('sign_up.consent')}</span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="marketing" className="mt-0.5 size-4 accent-[var(--color-action-primary)]" />
          <span>{t('sign_up.marketing')}</span>
        </label>
      </div>
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      <SNButton type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? t('sign_up.submitting') : t('sign_up.submit')}
      </SNButton>
    </form>
  );
}
