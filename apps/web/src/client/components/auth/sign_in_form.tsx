'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/client/components/ui/button';
import { Field, FormAlert } from '@/client/components/ui/field';
import { ApiError, apiRequest } from '@/client/lib/api';

export function SignInForm({
  initialError,
  redirectTo = '/',
}: {
  initialError?: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
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
      setError(passthrough ? err.message : "That email and password don't match. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        trailing={
          <Link href="/forgot-password" className="text-[13px] text-fg-brand underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        }
      />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  );
}
