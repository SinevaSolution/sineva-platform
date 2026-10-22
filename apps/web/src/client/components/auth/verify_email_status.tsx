'use client';

import Link from 'next/link';
import * as React from 'react';
import { apiRequest } from '@/client/lib/api';
import { useTranslations } from '@/i18n/provider';
import { SNBanner, SNButton } from '@sineva/ui';

type Status = 'verifying' | 'verified' | 'failed';

/** Confirms the emailed token once on load (POST, not on the GET link). */
export function VerifyEmailStatus({
  token,
  returnTo,
}: {
  token: string | null;
  returnTo?: string;
}) {
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
      <p role="status" className="text-center text-sm text-text-secondary">
        {t('verify_email.checking')}
      </p>
    );
  }
  if (status === 'verified') {
    return (
      <div className="space-y-4">
        <SNBanner tone="success">{t('verify_email.verified')}</SNBanner>
        <SNButton asChild variant="primary" size="lg" className="w-full">
          <Link href={returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : '/sign-in'}>
            {t('verify_email.continue')}
          </Link>
        </SNButton>
      </div>
    );
  }
  return <SNBanner tone="danger">{t('verify_email.failed')}</SNBanner>;
}
