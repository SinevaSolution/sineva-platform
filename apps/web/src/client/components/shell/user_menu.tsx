'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { cn } from '@/client/components/ui/cn';
import { Tooltip } from '@/client/components/ui/tooltip';
import { apiRequest } from '@/client/lib/api';
import type { ShellUserView } from '@/shared/shell_view';

const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] text-fg outline-none data-[highlighted]:bg-hover';

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return email.charAt(0).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The person at the bottom of the sidebar: avatar, name and email, opening
 * Profile, theme and Sign out. In the collapsed rail only the avatar shows.
 */
export function UserMenu({
  user,
  workspaceSlug,
  compact,
}: {
  user: ShellUserView;
  workspaceSlug: string;
  compact: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  async function signOut() {
    try {
      await apiRequest('/api/v1/auth/sign-out', { method: 'POST' });
      router.replace('/sign-in');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out. Try again.');
    }
  }

  const avatar = (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-focus)_22%,var(--color-surface))] text-[11px] font-semibold text-fg-brand"
    >
      {initials(user.name, user.email)}
    </span>
  );

  return (
    <DropdownMenu.Root>
      <Tooltip label="Your profile and sign out" side={compact ? 'right' : 'top'}>
        <DropdownMenu.Trigger
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-lg text-left hover:bg-hover data-[state=open]:bg-hover',
            compact ? 'size-9 justify-center' : 'h-11 w-full px-1.5',
          )}
        >
          {avatar}
          {compact ? (
            <span className="sr-only">{user.name}</span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{user.name || user.email}</span>
              <span className="block truncate text-[11px] text-fg-tertiary">{user.email}</span>
            </span>
          )}
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={compact ? 'right' : 'top'}
          align="start"
          sideOffset={8}
          className="anim-swap z-50 w-60 rounded-xl border border-line bg-surface p-1 shadow-popover"
        >
          <div className="px-2 pb-1.5 pt-1">
            <div className="truncate text-[13px] font-medium text-fg">{user.name}</div>
            <div className="truncate text-xs text-fg-tertiary">{user.email}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href={`/w/${workspaceSlug}/settings/profile`}>
              <UserRound aria-hidden="true" className="size-4" />
              Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={() => setTheme(isDark ? 'light' : 'dark')}>
            {isDark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
            {isDark ? 'Light mode' : 'Dark mode'}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={cn(itemClass, 'text-danger')} onSelect={signOut}>
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
