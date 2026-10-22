'use client';

import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import {
  SNBadge,
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuLabel,
  SNDropdownMenuTrigger,
  SNTooltip,
} from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { ShellUserView, ShellWorkspaceView } from '@/shared/shell_view';

export function WorkspaceMenu({
  workspace,
  workspaces,
  user,
  compact = false,
}: {
  workspace: ShellWorkspaceView;
  workspaces: ShellWorkspaceView[];
  user: ShellUserView;
  compact?: boolean;
}) {
  const t = useTranslations('shell');
  const tRoles = useTranslations('members');
  const roleLabels = {
    owner: tRoles('roles.owner'),
    admin: tRoles('roles.admin'),
    member: tRoles('roles.member'),
    viewer: tRoles('roles.viewer'),
  } as const;
  return (
    <SNDropdownMenu>
      <SNTooltip label={t('workspace_menu.switch')} side={compact ? 'right' : 'bottom'}>
      <SNDropdownMenuTrigger className="flex h-8 min-w-0 items-center gap-2 rounded-sm px-1.5 text-start hover:bg-(--state-hover) data-[state=open]:bg-(--state-hover)">
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-action-primary text-[10px] font-semibold text-text-inverse"
        >
          {workspace.name.charAt(0).toUpperCase()}
        </span>
        {compact ? (
          <span className="sr-only">{workspace.name}</span>
        ) : (
          <>
            <span className="truncate text-[13px] font-semibold text-text">{workspace.name}</span>
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-text-tertiary" />
          </>
        )}
      </SNDropdownMenuTrigger>
      </SNTooltip>
      <SNDropdownMenuContent align="start" sideOffset={6} anim={false} className="w-64">
          <div className="px-2 pb-1 pt-1.5 text-xs text-text-tertiary">{user.email}</div>
          <SNDropdownMenuLabel>{t('workspace_menu.workspaces')}</SNDropdownMenuLabel>
          {workspaces.map((ws) => (
            <SNDropdownMenuItem key={ws.id} asChild>
              <Link href={`/w/${ws.slug}`}>
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-action-primary text-[10px] font-semibold text-text-inverse"
                >
                  {ws.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{ws.name}</span>
                <SNBadge tone="neutral">{roleLabels[ws.role as keyof typeof roleLabels] ?? ws.role}</SNBadge>
                {ws.id === workspace.id ? (
                  <Check aria-label={t('workspace_menu.current')} className="size-4 text-text-brand" />
                ) : null}
              </Link>
            </SNDropdownMenuItem>
          ))}
      </SNDropdownMenuContent>
    </SNDropdownMenu>
  );
}
