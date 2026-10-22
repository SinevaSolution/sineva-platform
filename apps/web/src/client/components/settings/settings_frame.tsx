'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';
import { PageHeader } from '@/client/components/shell/page_header';
import { useTranslations } from '@/i18n/provider';
import { SettingsNav } from './settings_nav';
import { activeSettingsItem } from './settings_nav_model';

/**
 * One frame for every settings page: the thin title bar, then either the hub
 * (a wide card grid, no nav) or a sub-page (nav on the left, one content
 * column of at most 720 px). It also owns the scrolling, so a long page never
 * depends on the page above it.
 */
export function SettingsFrame({
  workspaceSlug,
  role,
  children,
}: {
  workspaceSlug: string;
  role: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('settings_ui');
  const pathname = usePathname();
  const onHub = activeSettingsItem(pathname, null) === null;
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {onHub ? (
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 md:py-10">{children}</div>
        ) : (
          <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:flex md:gap-12 md:py-10">
            <SettingsNav workspaceSlug={workspaceSlug} role={role} />
            <div className="min-w-0 max-w-[720px] flex-1">{children}</div>
          </div>
        )}
      </div>
    </>
  );
}
