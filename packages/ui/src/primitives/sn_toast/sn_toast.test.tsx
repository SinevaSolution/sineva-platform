// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import { SNToaster, snToast } from './sn_toast';

// What jsdom can and cannot prove about sonner:
// - Reliable: the aria-live region, the text, the action and close buttons,
//   auto-dismiss after the duration, removal on dismiss(), the toaster z-index.
// - Not reliable: hover pause. Sonner pauses its timers from `onMouseEnter`
//   on the <ol data-sonner-toaster> and from window blur / `document.hidden`,
//   and it measures toast heights through layout (always 0 in jsdom). The
//   hover case below asserts only what React's synthetic mouseenter delivers
//   and is the one test most likely to need a real-browser check.
// - Not testable: stacking/expanded layout, swipe to dismiss, position CSS
//   (sonner injects its stylesheet; jsdom does no layout).

beforeAll(installDomPolyfills);

beforeEach(() => {
  // requestAnimationFrame is faked too: dismiss(id) goes through two of them
  // before sonner marks the toast deleted.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
});
afterEach(() => {
  act(() => {
    snToast.dismiss();
    vi.runAllTimers();
  });
  cleanup();
  vi.useRealTimers();
});

function renderToaster(props: Partial<React.ComponentProps<typeof SNToaster>> = {}) {
  return render(<SNToaster closeLabel="Dismiss notification" {...props} />);
}

function fire(fn: () => void) {
  act(() => {
    fn();
    vi.advanceTimersByTime(50);
  });
}

describe('SNToaster and snToast', () => {
  it('shows the toast text inside an aria-live polite region', () => {
    renderToaster();
    fire(() => snToast.success('Saved'));
    const text = screen.getByText('Saved');
    const region = text.closest('[aria-live]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it.each(['success', 'error', 'info', 'warning', 'message'] as const)('snToast.%s renders its text', (kind) => {
    renderToaster();
    fire(() => snToast[kind](`text-${kind}`));
    expect(screen.getByText(`text-${kind}`)).toBeTruthy();
  });

  it('disappears after 5 seconds', () => {
    renderToaster();
    fire(() => snToast.info('Gone soon'));
    expect(screen.queryByText('Gone soon')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Gone soon')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Gone soon')).toBeNull();
  });

  it('dismiss() removes it right away', () => {
    renderToaster();
    let id: string | number = '';
    fire(() => {
      id = snToast.info('Dismiss me');
    });
    expect(screen.queryByText('Dismiss me')).not.toBeNull();
    act(() => {
      snToast.dismiss(id);
      vi.advanceTimersByTime(100);
    });
    // The unmount timer is scheduled by an effect that only runs once the
    // first act() flushes, so the clock has to advance in a second step.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Dismiss me')).toBeNull();
  });

  it('runs the action callback and shows its label', () => {
    renderToaster();
    const onClick = vi.fn();
    fire(() => snToast.error('Upload failed', { action: { label: 'Retry', onClick } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a close button named by closeLabel that dismisses', () => {
    renderToaster();
    fire(() => snToast.info('Closable'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Closable')).toBeNull();
  });

  it('keeps the toast past 5 seconds while the pointer is over the list', () => {
    renderToaster();
    fire(() => snToast.info('Held'));
    const list = document.querySelector('[data-sonner-toaster]') as HTMLElement;
    expect(list).not.toBeNull();
    fireEvent.mouseEnter(list);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByText('Held')).not.toBeNull();
    fireEvent.mouseLeave(list);
    act(() => {
      vi.advanceTimersByTime(6000);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Held')).toBeNull();
  });

  it('sits above a modal through the toast layer token', () => {
    renderToaster();
    fire(() => snToast.info('Layer'));
    const list = document.querySelector('[data-sonner-toaster]') as HTMLElement;
    expect(`${list.className} ${list.getAttribute('style') ?? ''}`).toContain('--z-toast');
  });

  it('is positioned at the bottom end', () => {
    renderToaster();
    fire(() => snToast.info('Pos'));
    const list = document.querySelector('[data-sonner-toaster]') as HTMLElement;
    expect(list.getAttribute('data-y-position')).toBe('bottom');
    expect(list.getAttribute('data-x-position')).toBe('right');
  });
});
