'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/client/lib/use_theme';
import { toast } from 'sonner';
import { cn } from '@/client/components/ui/cn';
import { Tooltip } from '@/client/components/ui/tooltip';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { ShellUserView } from '@/shared/shell_view';

const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 text-[13px] text-text outline-none data-[highlighted]:bg-(--state-hover)';

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
  const t = useTranslations('shell');
  const errorText = useApiErrorText();
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  async function signOut() {
    try {
      await apiRequest('/api/v1/auth/sign-out', { method: 'POST' });
      router.replace('/sign-in');
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  const avatar = (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-focus)_22%,var(--color-surface))] text-[11px] font-semibold text-text-brand"
    >
      {initials(user.name, user.email)}
    </span>
  );

  return (
    <DropdownMenu.Root>
      <Tooltip label={t('user_menu.tooltip')} side={compact ? 'right' : 'top'}>
        <DropdownMenu.Trigger
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-sm text-start hover:bg-(--state-hover) data-[state=open]:bg-(--state-hover)',
            compact ? 'size-9 justify-center' : 'h-11 w-full px-1.5',
          )}
        >
          {avatar}
          {compact ? (
            <span className="sr-only">{user.name}</span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-text">{user.name || user.email}</span>
              <span className="block truncate text-[11px] text-text-tertiary">{user.email}</span>
            </span>
          )}
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={compact ? 'right' : 'top'}
          align="start"
          sideOffset={8}
          className="anim-swap z-(--z-dropdown) w-60 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <div className="px-2 pb-1.5 pt-1">
            <div className="truncate text-[13px] font-medium text-text">{user.name}</div>
            <div className="truncate text-xs text-text-tertiary">{user.email}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href={`/w/${workspaceSlug}/settings/profile`}>
              <UserRound aria-hidden="true" className="size-4" />
              {t('user_menu.profile')}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={toggle}>
            {isDark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
            {isDark ? t('user_menu.light_mode') : t('user_menu.dark_mode')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={cn(itemClass, 'text-danger')} onSelect={signOut}>
            <LogOut aria-hidden="true" className="size-4" />
            {t('user_menu.sign_out')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
