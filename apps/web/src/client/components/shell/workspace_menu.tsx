'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Tooltip } from '@/client/components/ui/tooltip';
import type { ShellUserView, ShellWorkspaceView } from '@/shared/shell_view';

const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] text-fg outline-none data-[highlighted]:bg-hover';

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
  return (
    <DropdownMenu.Root>
      <Tooltip label="Switch workspace" side={compact ? 'right' : 'bottom'}>
      <DropdownMenu.Trigger className="flex h-8 min-w-0 items-center gap-2 rounded-lg px-1.5 text-left hover:bg-hover data-[state=open]:bg-hover">
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-primary text-[10px] font-semibold text-fg-inverse"
        >
          {workspace.name.charAt(0).toUpperCase()}
        </span>
        {compact ? (
          <span className="sr-only">{workspace.name}</span>
        ) : (
          <>
            <span className="truncate text-[13px] font-semibold text-fg">{workspace.name}</span>
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-tertiary" />
          </>
        )}
      </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-xl border border-line bg-surface p-1 shadow-popover"
        >
          <div className="px-2 pb-1 pt-1.5 text-xs text-fg-tertiary">{user.email}</div>
          <DropdownMenu.Label className="px-2 pb-1 pt-2 text-[11px] font-medium text-fg-tertiary">
            Workspaces
          </DropdownMenu.Label>
          {workspaces.map((ws) => (
            <DropdownMenu.Item key={ws.id} asChild className={itemClass}>
              <Link href={`/w/${ws.slug}`}>
                <span className="flex-1 truncate">{ws.name}</span>
                {ws.id === workspace.id ? (
                  <Check aria-label="Current workspace" className="size-4 text-fg-brand" />
                ) : null}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
