'use client';

import { buttonVariants } from '@/client/components/ui/button';
import { useTranslations } from '@/i18n/provider';
import { cn } from '@/client/components/ui/cn';

// Plain links on purpose: the OAuth start URL is a route handler that answers
// with a redirect to the provider. <Link> would prefetch it and try a client
// transition, which breaks the cross-origin redirect. A full page load is right.
export function OAuthButtons() {
  const t = useTranslations('auth');
  const cls = cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full');
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler redirect, see above */}
      <a href="/api/v1/auth/oauth/google" className={cls}>
        <GoogleMark />
        {t('oauth.google')}
      </a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler redirect, see above */}
      <a href="/api/v1/auth/oauth/github" className={cls}>
        <GitHubMark />
        {t('oauth.github')}
      </a>
    </div>
  );
}

export function OrDivider() {
  const t = useTranslations('auth');
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-text-tertiary" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      {t('oauth.or_email')}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.9 18 5.2 18 5.2c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
