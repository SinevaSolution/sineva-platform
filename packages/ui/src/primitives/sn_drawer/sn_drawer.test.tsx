// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, mockMatchMedia } from '../../__tests__/dom_polyfills';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNDrawer, type SNDrawerProps } from './sn_drawer';

beforeAll(installDomPolyfills);
afterEach(() => {
  cleanup();
  mockMatchMedia(false);
});

function setup(props: Partial<SNDrawerProps> = {}) {
  const onOpenChange = vi.fn();
  render(
    <SNTooltipProvider>
      <SNDrawer open onOpenChange={onOpenChange} title="Navigation" closeLabel="Close navigation" {...props}>
        <a href="/x">Link</a>
      </SNDrawer>
    </SNTooltipProvider>,
  );
  return { onOpenChange };
}

describe('SNDrawer', () => {
  it('is a dialog named by its title, sr-only by default', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeTruthy();
    expect(screen.getByText('Navigation').className).toContain('sr-only');
  });

  it('showTitle makes the title visible', () => {
    setup({ showTitle: true });
    expect(screen.getByText('Navigation').className).not.toContain('sr-only');
  });

  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const { onOpenChange } = setup();
    // The close button takes focus first (it is the first tabbable, as in the
    // old nav drawer) and its tooltip opens on that focus. A tooltip is the
    // top layer, so the first Escape dismisses it and the second the drawer.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    if (onOpenChange.mock.calls.length === 0) fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('has a close button named by closeLabel that closes', () => {
    const { onOpenChange } = setup();
    const close = screen.getByRole('button', { name: 'Close navigation' });
    expect(close.className).toContain('absolute');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('can show a closeTooltip that differs from the close button name', async () => {
    setup({ closeTooltip: 'Close menu' });
    // The close button takes focus on open, so its tooltip is already showing.
    expect((await screen.findByRole('tooltip')).textContent).toBe('Close menu');
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeTruthy();
  });

  it('is a side sheet at start by default on wide viewports (the app nav drawer)', () => {
    setup();
    const cls = screen.getByRole('dialog').className;
    for (const part of ['fixed', 'inset-y-0', 'start-0', 'z-(--z-drawer)', 'w-[280px]', 'max-w-[85vw]', 'bg-canvas-alt', 'shadow-md']) {
      expect(cls).toContain(part);
    }
    expect(cls).not.toContain('bottom-0');
  });

  it('side end anchors to the end edge', () => {
    setup({ side: 'end' });
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('end-0');
    expect(cls).not.toContain('start-0');
  });

  it('width panel reads --width-drawer', () => {
    setup({ width: 'panel' });
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('w-(--width-drawer)');
    expect(cls).not.toContain('w-[280px]');
  });

  it('is a bottom sheet below 768 px', () => {
    mockMatchMedia(true);
    setup();
    const cls = screen.getByRole('dialog').className;
    for (const part of ['inset-x-0', 'bottom-0', 'rounded-t-lg', 'max-h-[85dvh]', 'overflow-y-auto']) {
      expect(cls).toContain(part);
    }
    expect(cls).not.toContain('inset-y-0');
  });

  it('mobile="side" stays a side sheet on small viewports', () => {
    mockMatchMedia(true);
    setup({ mobile: 'side' });
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('inset-y-0');
    expect(cls).not.toContain('bottom-0');
  });

  it('puts className on the content and overlayClassName on the scrim, both last', () => {
    setup({ className: 'lg:hidden', overlayClassName: 'lg:hidden' });
    expect(screen.getByRole('dialog').className.endsWith('lg:hidden')).toBe(true);
    const scrim = document.querySelector('.bg-scrim') as HTMLElement;
    expect(scrim.className).toContain('z-(--z-drawer)');
    expect(scrim.className.endsWith('lg:hidden')).toBe(true);
  });

  it('moves focus inside and returns it to the opener on close', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const view = render(
      <SNTooltipProvider>
        <SNDrawer open onOpenChange={() => {}} title="T" closeLabel="Close">
          <a href="/x">Link</a>
        </SNDrawer>
      </SNTooltipProvider>,
    );
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true));
    view.rerender(
      <SNTooltipProvider>
        <SNDrawer open={false} onOpenChange={() => {}} title="T" closeLabel="Close">
          <a href="/x">Link</a>
        </SNDrawer>
      </SNTooltipProvider>,
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });
});
