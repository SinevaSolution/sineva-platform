'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import { SNPill } from '@sineva/ui';
import { SETTINGS_ICONS } from './settings_icons';
import { activeSettingsItem, buildSettingsNav } from './settings_nav_model';

const FOCUS = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';

/**
 * The settings nav. From 768 px it is a grouped list on the left, with planned
 * items shown but disabled. Below that it is one scrolling row of chips with
 * only the pages that exist: a chip that does nothing wastes a swipe. Plain
 * links, so the page is the URL and the server renders the right panel.
 */
export function SettingsNav({ workspaceSlug, role }: { workspaceSlug: string; role: string }) {
  const t = useTranslations('settings_ui');
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  const active = activeSettingsItem(pathname, tab);
  const groups = buildSettingsNav(workspaceSlug, role);
  const live = groups.flatMap((g) => g.items).filter((i) => !i.soon);

  return (
    <>
      <nav aria-label={t('nav_label')} className="hidden md:sticky md:top-0 md:block md:w-52 md:shrink-0 md:self-start">
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.id}>
              <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t(group.labelKey)}
              </h2>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = SETTINGS_ICONS[item.icon];
                  const body = (
                    <>
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                      {item.soon ? <SNPill tone="neutral">{t('soon')}</SNPill> : null}
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          scroll={false}
                          aria-current={item.id === active ? 'page' : undefined}
                          className={cn(
                            'flex h-9 items-center gap-2 rounded-sm px-3 text-[13px] font-medium transition-colors',
                            FOCUS,
                            item.id === active
                              ? 'bg-surface-tint text-text'
                              : 'text-text-secondary hover:bg-(--state-hover) hover:text-text',
                          )}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div
                          aria-disabled="true"
                          className="flex h-9 cursor-not-allowed items-center gap-2 rounded-sm px-3 text-[13px] font-medium text-text-tertiary"
                        >
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <nav aria-label={t('nav_label')} className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
        {live.map((item) => {
          const Icon = SETTINGS_ICONS[item.icon];
          const current = item.id === active;
          return (
            <Link
              key={item.id}
              href={item.href ?? '#'}
              scroll={false}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors',
                FOCUS,
                current
                  ? 'border-transparent bg-surface-tint text-text'
                  : 'border-border text-text-secondary hover:bg-(--state-hover)',
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
