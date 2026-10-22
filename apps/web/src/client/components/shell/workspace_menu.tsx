'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Tooltip } from '@/client/components/ui/tooltip';
import { useTranslations } from '@/i18n/provider';
import type { ShellUserView, ShellWorkspaceView } from '@/shared/shell_view';

const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 text-[13px] text-text outline-none data-[highlighted]:bg-(--state-hover)';

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
  return (
    <DropdownMenu.Root>
      <Tooltip label={t('workspace_menu.switch')} side={compact ? 'right' : 'bottom'}>
      <DropdownMenu.Trigger className="flex h-8 min-w-0 items-center gap-2 rounded-sm px-1.5 text-start hover:bg-(--state-hover) data-[state=open]:bg-(--state-hover)">
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
      </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-(--z-dropdown) w-64 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <div className="px-2 pb-1 pt-1.5 text-xs text-text-tertiary">{user.email}</div>
          <DropdownMenu.Label className="px-2 pb-1 pt-2 text-[11px] font-medium text-text-tertiary">
            {t('workspace_menu.workspaces')}
          </DropdownMenu.Label>
          {workspaces.map((ws) => (
            <DropdownMenu.Item key={ws.id} asChild className={itemClass}>
              <Link href={`/w/${ws.slug}`}>
                <span className="flex-1 truncate">{ws.name}</span>
                {ws.id === workspace.id ? (
                  <Check aria-label={t('workspace_menu.current')} className="size-4 text-text-brand" />
                ) : null}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
