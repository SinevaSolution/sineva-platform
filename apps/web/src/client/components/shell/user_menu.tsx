'use client';

import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  SNAvatar,
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuSeparator,
  SNDropdownMenuTrigger,
  snToast,
  SNTooltip,
} from '@sineva/ui';
import { usePersistedTheme } from '@/client/components/theme_sync';
import { cn } from '@/client/components/ui/cn';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { ShellUserView } from '@/shared/shell_view';

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
  const { isDark, choose } = usePersistedTheme();

  async function signOut() {
    try {
      await apiRequest('/api/v1/auth/sign-out', { method: 'POST' });
      router.replace('/sign-in');
      router.refresh();
    } catch (error) {
      snToast.error(errorText(error));
    }
  }

  const avatar = <SNAvatar name={user.name} email={user.email} size="sm" decorative />;

  return (
    <SNDropdownMenu>
      <SNTooltip label={t('user_menu.tooltip')} side={compact ? 'right' : 'top'}>
        <SNDropdownMenuTrigger
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
        </SNDropdownMenuTrigger>
      </SNTooltip>
      <SNDropdownMenuContent side={compact ? 'right' : 'top'} align="start" sideOffset={8} className="w-60">
          <div className="px-2 pb-1.5 pt-1">
            <div className="truncate text-[13px] font-medium text-text">{user.name}</div>
            <div className="truncate text-xs text-text-tertiary">{user.email}</div>
          </div>
          <SNDropdownMenuSeparator />
          <SNDropdownMenuItem asChild>
            <Link href={`/w/${workspaceSlug}/settings/profile`}>
              <UserRound aria-hidden="true" />
              {t('user_menu.profile')}
            </Link>
          </SNDropdownMenuItem>
          <SNDropdownMenuItem onSelect={() => choose(isDark ? 'light' : 'dark')}>
            {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {isDark ? t('user_menu.light_mode') : t('user_menu.dark_mode')}
          </SNDropdownMenuItem>
          <SNDropdownMenuSeparator />
          <SNDropdownMenuItem destructive onSelect={signOut}>
            <LogOut aria-hidden="true" />
            {t('user_menu.sign_out')}
          </SNDropdownMenuItem>
      </SNDropdownMenuContent>
    </SNDropdownMenu>
  );
}
