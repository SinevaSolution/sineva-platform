'use client';

import Link from 'next/link';
import * as React from 'react';
import { buttonVariants } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { FormAlert } from '@/client/components/ui/field';
import { apiRequest } from '@/client/lib/api';
import { useTranslations } from '@/i18n/provider';

type Status = 'verifying' | 'verified' | 'failed';

/** Confirms the emailed token once on load (POST, not on the GET link). */
export function VerifyEmailStatus({ token }: { token: string | null }) {
  const t = useTranslations('auth');
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
        {t('verify_email.checking')}
      </p>
    );
  }
  if (status === 'verified') {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">{t('verify_email.verified')}</FormAlert>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
          {t('verify_email.continue')}
        </Link>
      </div>
    );
  }
  return <FormAlert>{t('verify_email.failed')}</FormAlert>;
}
