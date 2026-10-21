'use client';

import Link from 'next/link';
import * as React from 'react';
import { Button, buttonVariants } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { Field, FormAlert } from '@/client/components/ui/field';
import { ApiError, apiRequest } from '@/client/lib/api';

const MIN_PASSWORD = 12;

export function ForgotPasswordForm() {
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
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    // Same message whether or not the account exists.
    return (
      <FormAlert tone="success">
        If that email has an account, a reset link is on its way. It works for 30 minutes.
      </FormAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending...' : 'Send reset link'}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  if (!token) {
    return <FormAlert>This reset link is incomplete. Request a new one.</FormAlert>;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < MIN_PASSWORD) {
      setFieldError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== form.get('confirm')) {
      setFieldError("The two passwords don't match.");
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
          ? 'This link has expired or was already used. Request a new one.'
          : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">Your password is changed. Other devices were signed out.</FormAlert>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={fieldError}
      />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Saving...' : 'Save new password'}
      </Button>
    </form>
  );
}
