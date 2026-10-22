'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ThemeSync } from '@/client/components/theme_sync';
import { collapsedCookieNeedsSeed } from '@/client/lib/preference_sync_model';
import { savePreferences } from '@/client/lib/preferences';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useAppDispatch, useAppSelector } from '@/client/store/hooks';
import type { PreferencesView } from '@/shared/profile_view';
import { useTranslations } from '@/i18n/provider';
import { setMobileNavOpen } from '@/client/store/slices/ui_slice';
import { cn } from '@/client/components/ui/cn';
import { Tooltip } from '@/client/components/ui/tooltip';
import { SIDEBAR_COOKIE } from './nav_model';
import { Sidebar, type SidebarProps } from './sidebar';

/**
 * App frame: sidebar on the canvas, content in a rounded inset panel
 * (Linear pattern). On desktop the sidebar collapses to a 56 px icon rail
 * (button or the "[" key); the choice is a cookie so the server renders the
 * right width and nothing jumps on load, and it is also saved to the account
 * (`sidebar_collapsed`) so a new device starts the same way. Below 1024 px it
 * is a drawer.
 */
export function AppShell({
  children,
  initialCollapsed,
  storedTheme,
  ...sidebarProps
}: Omit<SidebarProps, 'onNavigate' | 'collapsed' | 'onToggleCollapsed'> & {
  children: React.ReactNode;
  initialCollapsed: boolean;
  /** The theme saved on the account, applied once per session by `ThemeSync`. */
  storedTheme: PreferencesView['theme'];
}) {
  const t = useTranslations('shell');
  const errorText = useApiErrorText();
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  // The toggle needs the current value to compute the next one and to save it;
  // a ref keeps that out of a state updater, which React may run twice.
  const collapsedRef = React.useRef(initialCollapsed);
  const toggleCollapsed = React.useCallback(() => {
    const next = !collapsedRef.current;
    collapsedRef.current = next;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
    // The cookie already decided what the person sees; a failed save only
    // means the next device will not inherit it, so it is reported, not undone.
    savePreferences({ sidebar_collapsed: next }).catch((error: unknown) => toast.error(errorText(error)));
  }, [errorText]);

  // A device with no cookie yet renders from the account preference (the
  // layout passes it as `initialCollapsed`); write the cookie so the next load
  // takes the fast path.
  React.useEffect(() => {
    if (collapsedCookieNeedsSeed(document.cookie)) {
      document.cookie = `${SIDEBAR_COOKIE}=${collapsedRef.current ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  // "[" toggles the sidebar, like Linear, unless the user is typing.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.mobile_nav_open);
  const pathname = usePathname();
  const close = React.useCallback(() => dispatch(setMobileNavOpen(false)), [dispatch]);

  // Close the drawer whenever the route changes (back button included).
  React.useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <ThemeSync stored={storedTheme} />
      <aside
        className={cn(
          'hidden shrink-0 bg-sidebar transition-[width] duration-200 ease-[var(--ease-out-quint)] lg:block',
          collapsed ? 'w-14' : 'w-[248px]',
        )}
      >
        <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <Dialog.Root open={open} onOpenChange={(v) => dispatch(setMobileNavOpen(v))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] bg-sidebar shadow-popover lg:hidden">
            <Dialog.Title className="sr-only">{t('frame.nav_title')}</Dialog.Title>
            <Tooltip label={t('frame.close_menu')} side="left">
              <Dialog.Close
                aria-label={t('frame.close_nav')}
                className="absolute right-2 top-3 flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
              >
                <X aria-hidden="true" className="size-4" />
              </Dialog.Close>
            </Tooltip>
            <Sidebar {...sidebarProps} onNavigate={close} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3 lg:hidden">
          <Tooltip label={t('frame.open_menu')} side="bottom">
            <button
              type="button"
              onClick={() => dispatch(setMobileNavOpen(true))}
              aria-label={t('frame.open_nav')}
              className="flex size-9 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </Tooltip>
          <span className="truncate text-sm font-semibold">{sidebarProps.workspace.name}</span>
        </div>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:rounded-xl lg:shadow-panel">
          {children}
        </main>
      </div>
    </div>
  );
}
