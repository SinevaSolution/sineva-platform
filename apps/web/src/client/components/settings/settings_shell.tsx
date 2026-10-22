'use client';

import { KeyRound, SlidersHorizontal, UserRound } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import { SETTINGS_TABS, settingsTabHref, type SettingsTab } from './settings_tabs';

const ICONS: Record<SettingsTab, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  profile: UserRound,
  preferences: SlidersHorizontal,
  sign_in: KeyRound,
};

/**
 * Settings frame: a sub-nav on the left from 768 px (a segmented control above
 * the content below that) and one content column of at most 680 px. Plain
 * links, so the tab is the URL and the server renders the right panel.
 */
export function SettingsShell({
  workspaceSlug,
  active,
  children,
}: {
  workspaceSlug: string;
  active: SettingsTab;
  children: React.ReactNode;
}) {
  const t = useTranslations('account');

  function label(tab: SettingsTab): string {
    switch (tab) {
      case 'profile':
        return t('tabs.profile');
      case 'preferences':
        return t('tabs.preferences');
      case 'sign_in':
        return t('tabs.sign_in');
    }
  }

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-6 md:flex md:gap-12 md:py-10">
      <nav
        aria-label={t('tabs.label')}
        className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-surface-alt p-1 md:sticky md:top-0 md:mb-0 md:w-44 md:shrink-0 md:flex-col md:self-start md:overflow-visible md:rounded-none md:bg-transparent md:p-0"
      >
        {SETTINGS_TABS.map((tab) => {
          const Icon = ICONS[tab];
          const current = tab === active;
          return (
            <Link
              key={tab}
              href={settingsTabHref(workspaceSlug, tab)}
              scroll={false}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors md:h-9 md:flex-none md:justify-start',
                current
                  ? 'bg-surface text-fg shadow-panel md:bg-selected md:shadow-none'
                  : 'text-fg-secondary hover:bg-hover hover:text-fg',
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{label(tab)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 max-w-[680px] flex-1">{children}</div>
    </div>
  );
}
