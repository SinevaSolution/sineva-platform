'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import { SNBanner, SNButton, SNCard, SNPill } from '@sineva/ui';
import { SETTINGS_ICONS } from './settings_icons';
import { buildSettingsNav, type SettingsNavItem } from './settings_nav_model';

export interface SettingsHubData {
  workspaceSlug: string;
  workspaceName: string;
  userName: string;
  userEmail: string;
  emailVerified: boolean;
  membersCount: number;
  /** Whole percent of Business Profile fields that have a value. */
  profileCompleteness: number;
  /** Onboarding is not finished for this person. */
  resumeSetup: boolean;
}

/**
 * The Settings index: who and where you are, a banner when setup is
 * unfinished, then the same two groups as the nav, one card per page. Hints
 * show only facts that are cheap and real; a planned page gets a "Soon" pill
 * and no hint.
 */
export function SettingsHub({ role, ...data }: SettingsHubData & { role: string }) {
  const t = useTranslations('settings_ui');
  const groups = buildSettingsNav(data.workspaceSlug, role);

  function hint(item: SettingsNavItem): React.ReactNode {
    switch (item.id) {
      case 'profile':
        return <span className="truncate">{data.userEmail}</span>;
      case 'sign_in':
        return (
          <SNPill tone={data.emailVerified ? 'positive' : 'neutral'}>
            {data.emailVerified ? t('hub.email_verified') : t('hub.email_unverified')}
          </SNPill>
        );
      case 'business':
        return <span>{t('hub.profile_complete', { percent: data.profileCompleteness })}</span>;
      case 'members':
        return (
          <span>
            {data.membersCount === 1
              ? t('hub.members_one')
              : t('hub.members_other', { count: data.membersCount })}
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-action-primary text-lg font-semibold text-text-inverse"
        >
          {(data.workspaceName.trim()[0] ?? '?').toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-text">{data.workspaceName}</h1>
          <p className="truncate text-sm text-text-secondary">
            {t('hub.signed_in_as', { name: data.userName || data.userEmail })}
          </p>
        </div>
      </header>

      {data.resumeSetup ? (
        <SNBanner
          tone="info"
          title={t('hub.resume_title')}
          action={
            <SNButton asChild size="sm" variant="secondary">
              <Link href={`/w/${data.workspaceSlug}/onboarding`}>{t('hub.resume_action')}</Link>
            </SNButton>
          }
        >
          {t('hub.resume_body')}
        </SNBanner>
      ) : null}

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`settings-group-${group.id}`}>
          <h2 id={`settings-group-${group.id}`} className="pb-3 text-[13px] font-semibold text-text">
            {t(group.labelKey)}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.items.map((item) => {
              const Icon = SETTINGS_ICONS[item.icon];
              const content = (
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full',
                      item.soon ? 'bg-canvas-alt text-text-tertiary' : 'bg-surface-tint text-text-brand',
                    )}
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={cn('truncate text-sm font-medium', item.soon ? 'text-text-secondary' : 'text-text')}>
                        {t(item.labelKey)}
                      </h3>
                      {item.soon ? <SNPill tone="neutral">{t('soon')}</SNPill> : null}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-text-secondary">{t(item.descriptionKey)}</p>
                    {!item.soon && hint(item) ? (
                      <div className="mt-2 flex items-center gap-1 text-xs text-text-tertiary">{hint(item)}</div>
                    ) : null}
                  </div>
                  {item.href ? (
                    <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-text-tertiary rtl:rotate-180" />
                  ) : null}
                </div>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <SNCard asChild interactive className="block h-full">
                      <Link href={item.href}>{content}</Link>
                    </SNCard>
                  ) : (
                    <SNCard aria-disabled="true" className="h-full opacity-70">
                      {content}
                    </SNCard>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
