'use client';

import * as React from 'react';
import { Button } from '@/client/components/ui/button';
import { Field, FormAlert } from '@/client/components/ui/field';
import { ApiError, apiRequest } from '@/client/lib/api';

// Placeholder versions until Legal publishes the terms (decision D-M0-4).
const TERMS_VERSION = '2026-10-draft';
const PRIVACY_VERSION = '2026-10-draft';
const MIN_PASSWORD = 12;

export function SignUpForm() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (!form.get('consent')) {
      setError('Please agree to the terms to continue.');
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
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <FormAlert tone="success">
        We sent a link to <strong className="font-semibold">{sentTo}</strong>. Open it to verify your email, then
        sign in.
      </FormAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Full name" name="full_name" autoComplete="name" required autoFocus maxLength={100} />
      <Field label="Work email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={passwordError}
      />
      <div className="space-y-2.5 pt-1 text-[13px] text-fg-secondary">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-[var(--color-action-primary)]" />
          <span>I agree to the Terms of Service and the Privacy Policy.</span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="marketing" className="mt-0.5 size-4 accent-[var(--color-action-primary)]" />
          <span>Send me product news now and then. You can stop any time.</span>
        </label>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Creating your account...' : 'Create account'}
      </Button>
    </form>
  );
}
