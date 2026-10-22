'use client';

import { Mail } from 'lucide-react';
import * as React from 'react';
import { GitHubMark, GoogleMark } from '@/client/components/auth/oauth_buttons';
import { SNPill } from '@sineva/ui';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { useTranslations } from '@/i18n/provider';
import { SettingsRow, SettingsSection } from './settings_layout';

export interface LinkedAccountView {
  provider: string;
  provider_email: string | null;
  provider_username: string | null;
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border bg-surface [&_svg]:size-[18px]"
    >
      {children}
    </span>
  );
}

/**
 * Read-only view of how this person can sign in. Linking and unlinking stay
 * on the existing account routes; this page shows the state truthfully
 * instead of offering buttons that do nothing.
 */
export function SignInMethods({
  email,
  accounts,
}: {
  email: string;
  accounts: LinkedAccountView[];
}) {
  const t = useTranslations('account');
  const byProvider = new Map(accounts.map((a) => [a.provider, a]));
  const hasPassword = byProvider.has('credential');

  function detail(provider: LinkedAccountView | undefined): string {
    if (!provider) return t('sign_in.not_linked_helper');
    return provider.provider_email ?? provider.provider_username ?? t('sign_in.linked_helper');
  }

  return (
    <div className="space-y-9">
      <SettingsSection title={t('sign_in.section_methods')}>
        <SettingsRow inline label={t('sign_in.google')} helper={detail(byProvider.get('google'))}>
          <span className="flex items-center gap-3">
            <Mark>
              <GoogleMark />
            </Mark>
            <SNPill tone={byProvider.has('google') ? 'positive' : 'neutral'}>
              {byProvider.has('google') ? t('profile.linked') : t('profile.not_linked')}
            </SNPill>
          </span>
        </SettingsRow>
        <SettingsRow inline label={t('sign_in.github')} helper={detail(byProvider.get('github'))}>
          <span className="flex items-center gap-3">
            <Mark>
              <GitHubMark />
            </Mark>
            <SNPill tone={byProvider.has('github') ? 'positive' : 'neutral'}>
              {byProvider.has('github') ? t('profile.linked') : t('profile.not_linked')}
            </SNPill>
          </span>
        </SettingsRow>
        <SettingsRow inline label={t('sign_in.password')} helper={email}>
          <span className="flex items-center gap-3">
            <Mark>
              <Mail className="text-text-secondary" />
            </Mark>
            <SNPill tone={hasPassword ? 'positive' : 'neutral'}>
              {hasPassword ? t('sign_in.password_set') : t('sign_in.password_not_set')}
            </SNPill>
          </span>
        </SettingsRow>
        {!byProvider.has('google') && !byProvider.has('github') ? (
          <PresetEmptyState preset="sign_in_methods_none" className="py-4" />
        ) : null}
      </SettingsSection>
    </div>
  );
}
