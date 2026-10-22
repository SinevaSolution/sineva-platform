'use client';

import * as React from 'react';
import { SNBanner, SNButton, SNDialog, SNField, SNInput } from '@sineva/ui';
import { ApiError } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { OAuthProviderId, ReauthMethods } from '@/shared/sign_in_methods_view';
import { GitHubMark, GoogleMark } from './oauth_buttons';

/**
 * "Confirm it's you" for sensitive actions (removing a member, handing over
 * ownership, linking or unlinking a sign-in method). Offers every way this
 * person can actually prove it: the password when the account has one, and a
 * "Continue with Google/GitHub" button for each linked provider. The provider
 * path leaves the app and comes back to the same page, so the caller saves the
 * pending action in `onOAuthStart` and finishes it on return.
 */
export function ReauthDialog({
  open,
  onOpenChange,
  methods,
  onPassword,
  onOAuthStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: ReauthMethods;
  /** Runs the password check and then the waiting action; throws to keep the dialog open. */
  onPassword: (password: string) => Promise<void>;
  /** Called right before the browser leaves for the provider. */
  onOAuthStart: () => void;
}) {
  const t = useTranslations('reauth');
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hasAny = methods.has_password || methods.providers.length > 0;

  // Computed only while open: the dialog never renders on the server.
  const returnTo = open ? `${window.location.pathname}${window.location.search}` : '/';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      await onPassword(password);
    } catch (err) {
      // A 401 here is the wrong password, not a lost session: the person is
      // signed in, they just mistyped.
      setError(
        err instanceof ApiError && err.status === 401 ? t('wrong_password') : errorText(err),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <SNDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        // A wrong password from the last attempt must not greet the next opening.
        setError(null);
        onOpenChange(next);
      }}
      title={t('title')}
      description={t('body')}
    >
      <div className="space-y-4">
        {methods.providers.map((provider) => (
          <ProviderButton
            key={provider}
            provider={provider}
            returnTo={returnTo}
            onStart={onOAuthStart}
          />
        ))}
        {methods.providers.length > 0 && methods.has_password ? (
          <p className="text-center text-xs text-text-tertiary">{t('or_password')}</p>
        ) : null}
        {methods.has_password ? (
          <form onSubmit={submit} className="space-y-4">
            <SNField label={t('password_label')} required>
              <SNInput type="password" name="password" autoComplete="current-password" required />
            </SNField>
            <div className="flex justify-end gap-2">
              <SNButton
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  onOpenChange(false);
                }}
              >
                {t('cancel')}
              </SNButton>
              <SNButton type="submit" size="sm" variant="primary" loading={pending}>
                {t('confirm')}
              </SNButton>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <SNButton type="button" size="sm" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </SNButton>
          </div>
        )}
        {!hasAny ? <SNBanner tone="warning">{t('no_method')}</SNBanner> : null}
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      </div>
    </SNDialog>
  );
}

// A plain link on purpose: the start URL answers with a redirect to the
// provider, which a client-side transition cannot follow.
function ProviderButton({
  provider,
  returnTo,
  onStart,
}: {
  provider: OAuthProviderId;
  returnTo: string;
  onStart: () => void;
}) {
  const t = useTranslations('reauth');
  const href = `/api/v1/auth/oauth/${provider}?intent=reauth&return_to=${encodeURIComponent(returnTo)}`;
  return (
    <SNButton asChild variant="secondary" size="lg" className="w-full">
      <a href={href} onClick={onStart}>
        {provider === 'google' ? <GoogleMark /> : <GitHubMark />}
        {provider === 'google' ? t('continue_google') : t('continue_github')}
      </a>
    </SNButton>
  );
}
