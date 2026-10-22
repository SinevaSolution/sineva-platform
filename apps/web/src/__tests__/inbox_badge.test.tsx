// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { SNTooltipProvider } from '@sineva/ui';
import { emitInboxChanged, useInboxBadge } from '@/client/components/inbox/inbox_events';
import { Sidebar } from '@/client/components/shell/sidebar';
import { AppProviders } from '@/client/store/provider';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/w/acme', useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const counts = (badge: number) => ({
  needs_review: badge,
  needs_input: 0,
  updates: 0,
  done: 0,
  badge,
  unread_needs_review: 0,
  unread_needs_input: 0,
  unread_updates: 0,
});

describe('the sidebar badge', () => {
  it('starts from the server count and moves at once when the Inbox screen decides something', () => {
    const { result } = renderHook(() => useInboxBadge('ws-1', 3));
    expect(result.current).toBe(3);
    act(() => emitInboxChanged({ badge_delta: -1 }));
    expect(result.current).toBe(2);
    act(() => emitInboxChanged({ badge_delta: -5 }));
    expect(result.current).toBe(0);
    act(() => emitInboxChanged({ badge_delta: 1 }));
    expect(result.current).toBe(1);
  });

  it('settles on the server number when asked to refetch', async () => {
    api.mockResolvedValue(counts(7));
    const { result } = renderHook(() => useInboxBadge('ws-1', 3));
    act(() => emitInboxChanged({ refetch: true }));
    await waitFor(() => expect(result.current).toBe(7));
    expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/inbox/counts');
  });

  it('asks again every 30 seconds and when the tab comes back', async () => {
    vi.useFakeTimers();
    api.mockResolvedValue(counts(4));
    const { result } = renderHook(() => useInboxBadge('ws-1', 1));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(4);
    api.mockResolvedValue(counts(5));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(5);
  });

  it('keeps the number it has when asking fails', async () => {
    api.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useInboxBadge('ws-1', 3));
    await act(async () => {
      emitInboxChanged({ refetch: true });
    });
    expect(result.current).toBe(3);
  });

  it('takes a newer server render over what it holds', () => {
    const { result, rerender } = renderHook(({ initial }) => useInboxBadge('ws-1', initial), {
      initialProps: { initial: 3 },
    });
    act(() => emitInboxChanged({ badge_delta: -1 }));
    rerender({ initial: 9 });
    expect(result.current).toBe(9);
  });

  it('shows on the Inbox item of the sidebar and follows a decision', () => {
    render(
      <I18nProvider locale="en" messages={CATALOGS.en}>
        <AppProviders>
          <SNTooltipProvider>
            <Sidebar
              workspace={{ id: 'ws-1', slug: 'acme', name: 'Acme', role: 'owner' }}
              workspaces={[{ id: 'ws-1', slug: 'acme', name: 'Acme', role: 'owner' }]}
              user={{ name: 'Rina', email: 'rina@acme.test' }}
              specialists={[]}
              inboxCount={3}
            />
          </SNTooltipProvider>
        </AppProviders>
      </I18nProvider>,
    );
    const inbox = screen.getByRole('link', { name: /Inbox/ });
    expect(inbox.textContent).toContain('3');
    act(() => emitInboxChanged({ badge_delta: -1 }));
    expect(screen.getByRole('link', { name: /Inbox/ }).textContent).toContain('2');
  });
});
