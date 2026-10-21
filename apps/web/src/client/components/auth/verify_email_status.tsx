'use client';

import Link from 'next/link';
import * as React from 'react';
import { buttonVariants } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { FormAlert } from '@/client/components/ui/field';
import { apiRequest } from '@/client/lib/api';

type Status = 'verifying' | 'verified' | 'failed';

/** Confirms the emailed token once on load (POST, not on the GET link). */
export function VerifyEmailStatus({ token }: { token: string | null }) {
  const [status, setStatus] = React.useState<Status>(token ? 'verifying' : 'failed');
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiRequest('/api/v1/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setStatus('verified'))
      .catch(() => setStatus('failed'));
  }, [token]);

  if (status === 'verifying') {
    return (
      <p role="status" className="text-center text-sm text-fg-secondary">
        Checking your link...
      </p>
    );
  }
  if (status === 'verified') {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">Your email is verified. You&apos;re all set.</FormAlert>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
          Continue to sign in
        </Link>
      </div>
    );
  }
  return (
    <FormAlert>This link has expired or was already used. Sign in and we&apos;ll send you a new one.</FormAlert>
  );
}
