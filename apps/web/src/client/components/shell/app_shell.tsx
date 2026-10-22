'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useAppDispatch, useAppSelector } from '@/client/store/hooks';
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
 * right width and nothing jumps on load. Below 1024 px it is a drawer.
 */
export function AppShell({
  children,
  initialCollapsed,
  ...sidebarProps
}: Omit<SidebarProps, 'onNavigate' | 'collapsed' | 'onToggleCollapsed'> & {
  children: React.ReactNode;
  initialCollapsed: boolean;
}) {
  const t = useTranslations('shell');
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
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
    <div className="flex h-dvh overflow-hidden bg-canvas-alt">
      <aside
        className={cn(
          'hidden shrink-0 bg-canvas-alt transition-[width] duration-200 ease-[var(--ease-out-quint)] lg:block',
          collapsed ? 'w-14' : 'w-[248px]',
        )}
      >
        <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <Dialog.Root open={open} onOpenChange={(v) => dispatch(setMobileNavOpen(v))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-(--z-drawer) bg-scrim lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 start-0 z-(--z-drawer) w-[280px] max-w-[85vw] bg-canvas-alt shadow-md lg:hidden">
            <Dialog.Title className="sr-only">{t('frame.nav_title')}</Dialog.Title>
            <Tooltip label={t('frame.close_menu')} side="left">
              <Dialog.Close
                aria-label={t('frame.close_nav')}
                className="absolute end-2 top-3 flex size-8 items-center justify-center rounded-sm text-text-secondary hover:bg-(--state-hover)"
              >
                <X aria-hidden="true" className="size-4" />
              </Dialog.Close>
            </Tooltip>
            <Sidebar {...sidebarProps} onNavigate={close} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pe-2">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3 lg:hidden">
          <Tooltip label={t('frame.open_menu')} side="bottom">
            <button
              type="button"
              onClick={() => dispatch(setMobileNavOpen(true))}
              aria-label={t('frame.open_nav')}
              className="flex size-9 items-center justify-center rounded-sm text-text-secondary hover:bg-(--state-hover)"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </Tooltip>
          <span className="truncate text-sm font-semibold">{sidebarProps.workspace.name}</span>
        </div>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:rounded-md lg:shadow-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
