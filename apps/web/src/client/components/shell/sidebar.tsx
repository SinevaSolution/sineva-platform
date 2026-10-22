'use client';

import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { Tooltip } from '@/client/components/ui/tooltip';
import { useAppDispatch, useAppSelector } from '@/client/store/hooks';
import { useTranslations } from '@/i18n/provider';
import { toggleSidebarSection } from '@/client/store/slices/ui_slice';
import type { ShellSpecialistView, ShellUserView, ShellWorkspaceView } from '@/shared/shell_view';
import { NavIcon } from './nav_icon';
import { buildNavSections, FEATURES, isNavItemActive, type NavItem } from './nav_model';
import { RecentChats } from './recent_chats';
import { UserMenu } from './user_menu';
import { WorkspaceMenu } from './workspace_menu';

export interface SidebarProps {
  workspace: ShellWorkspaceView;
  workspaces: ShellWorkspaceView[];
  user: ShellUserView;
  specialists: ShellSpecialistView[];
  /** Icon rail: icons only, labels in tooltips, no Recent chats. */
  collapsed?: boolean;
  /** Desktop collapse toggle; absent in the mobile drawer. */
  onToggleCollapsed?: () => void;
  /** Closes the mobile drawer after a link is followed. */
  onNavigate?: () => void;
}

/**
 * Linear-style sidebar. Top: workspace switcher and the collapse toggle.
 * Then Home, New chat and Inbox, the Workspace and Automate groups (planned
 * features show a "Soon" tag), Recent chats with who each chat is with, and
 * at the bottom Settings and the user menu (Profile, theme, Sign out).
 */
export function Sidebar({
  workspace,
  workspaces,
  user,
  specialists,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('shell');
  const dispatch = useAppDispatch();
  const closedSections = useAppSelector((s) => s.ui.collapsed_sections);
  const sections = React.useMemo(() => buildNavSections(workspace.slug), [workspace.slug]);
  const names = React.useMemo(
    () => Object.fromEntries(specialists.map((s) => [s.agent_slug, s.display_name])),
    [specialists],
  );
  const settings: NavItem = {
    id: 'settings',
    labelKey: FEATURES.settings.labelKey,
    href: `/w/${workspace.slug}/settings`,
    icon: 'settings',
    exact: false,
    soon: true,
  };

  const row = (item: NavItem) => (
    <NavRow
      key={item.id}
      item={item}
      active={isNavItemActive(pathname, item.href, item.exact)}
      compact={collapsed}
      onNavigate={onNavigate}
    />
  );

  return (
    <nav aria-label={t('sidebar.main_label')} className={cn('flex h-full flex-col pb-2 pt-3', collapsed ? 'items-center px-2' : 'px-3')}>
      <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between')}>
        <WorkspaceMenu workspace={workspace} workspaces={workspaces} user={user} compact={collapsed} />
        {onToggleCollapsed ? (
          <Tooltip label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')} shortcut="[" side={collapsed ? 'right' : 'bottom'}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
              className="flex size-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-(--state-hover) hover:text-text"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" className="size-4" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose aria-hidden="true" className="size-4" strokeWidth={1.75} />
              )}
            </button>
          </Tooltip>
        ) : null}
      </div>

      <div className={cn('mt-3 flex min-h-0 w-full flex-1 flex-col overflow-y-auto', collapsed ? 'gap-3' : '-mx-1 gap-4 px-1')}>
        {sections.map((section) => {
          const isClosed = !collapsed && section.labelKey !== null && closedSections.includes(section.id);
          const listId = `sidebar-section-${section.id}`;
          return (
            <div key={section.id} className={cn(collapsed && section.labelKey && 'border-t border-border pt-3')}>
              {section.labelKey && !collapsed ? (
                <SectionHeader
                  label={t(section.labelKey)}
                  closed={isClosed}
                  controls={listId}
                  onToggle={() => dispatch(toggleSidebarSection(section.id))}
                />
              ) : null}
              {!isClosed ? (
                <ul id={listId} className={cn('space-y-px', collapsed && 'flex flex-col items-center gap-0.5')}>
                  {section.items.map(row)}
                </ul>
              ) : null}
            </div>
          );
        })}

        {!collapsed ? (
          <div>
            <SectionHeader
              label={t('sections.recent')}
              closed={closedSections.includes('recent')}
              controls="sidebar-section-recent"
              onToggle={() => dispatch(toggleSidebarSection('recent'))}
            />
            {!closedSections.includes('recent') ? (
              <div id="sidebar-section-recent">
                <RecentChats
                  workspaceId={workspace.id}
                  workspaceSlug={workspace.slug}
                  specialistNames={names}
                  onNavigate={onNavigate}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={cn('mt-2 w-full border-t border-border pt-2', collapsed && 'flex flex-col items-center gap-1')}>
        <ul className={cn(collapsed && 'flex flex-col items-center')}>{row(settings)}</ul>
        <div className="mt-1">
          <UserMenu user={user} workspaceSlug={workspace.slug} compact={collapsed} />
        </div>
      </div>
    </nav>
  );
}

function NavRow({
  item,
  active,
  compact,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('shell');
  const label = t(item.labelKey);
  const hint = item.soon ? t('sidebar.hint_soon', { label }) : label;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? hint : undefined}
      className={cn(
        'flex items-center rounded-sm text-[13px] text-text-secondary transition-colors duration-100 hover:bg-(--state-hover) hover:text-text',
        compact ? 'size-9 justify-center' : 'h-7 gap-2 px-2',
        active && 'bg-surface-tint font-medium text-text',
      )}
    >
      <NavIcon name={item.icon} />
      {!compact ? (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {item.soon ? (
            <span className="rounded-full bg-(--state-hover) px-1.5 text-[10px] font-medium leading-4 text-text-tertiary">{t('sidebar.soon_tag')}</span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
  return (
    <li>
      {/* Expanded rows show their label, so only "soon" rows need a tooltip
          there; in the rail every icon gets one. */}
      {compact || item.soon ? (
        <Tooltip label={item.soon ? t('sidebar.tooltip_soon', { label }) : label} side="right">
          {link}
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}

function SectionHeader({
  label,
  closed,
  controls,
  onToggle,
}: {
  label: string;
  closed: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!closed}
      aria-controls={controls}
      className="group mb-0.5 flex h-6 items-center gap-1 rounded-xs px-2 text-xs font-medium text-text-tertiary hover:text-text-secondary"
    >
      {label}
      <ChevronRight
        aria-hidden="true"
        className={cn('size-3 transition-transform duration-150', !closed && 'rotate-90')}
      />
    </button>
  );
}
