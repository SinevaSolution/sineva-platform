// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills } from '../../__tests__/dom_polyfills';
import {
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuLabel,
  SNDropdownMenuSeparator,
  SNDropdownMenuTrigger,
} from './sn_dropdown_menu';

beforeAll(installDomPolyfills);
afterEach(cleanup);

function setup(props: { onSelect?: () => void; onCloseAutoFocus?: (e: Event) => void } = {}) {
  return render(
    <SNDropdownMenu>
      <SNDropdownMenuTrigger className="trigger-x">Menu</SNDropdownMenuTrigger>
      <SNDropdownMenuContent className="w-40" onCloseAutoFocus={props.onCloseAutoFocus}>
        <SNDropdownMenuLabel>Section</SNDropdownMenuLabel>
        <SNDropdownMenuItem onSelect={props.onSelect}>Rename</SNDropdownMenuItem>
        <SNDropdownMenuSeparator />
        <SNDropdownMenuItem destructive>Delete</SNDropdownMenuItem>
        <SNDropdownMenuItem disabled>Locked</SNDropdownMenuItem>
        <SNDropdownMenuItem asChild>
          <a href="/profile">Profile</a>
        </SNDropdownMenuItem>
      </SNDropdownMenuContent>
    </SNDropdownMenu>,
  );
}

function open() {
  const trigger = screen.getByRole('button', { name: 'Menu' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return trigger;
}

describe('SNDropdownMenu', () => {
  it('stays closed until the trigger gets Enter, then exposes role=menu with menuitems', () => {
    setup();
    expect(screen.queryByRole('menu')).toBeNull();
    open();
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').length).toBe(4);
  });

  it('also opens on ArrowDown and takes a trigger className', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger.className).toContain('trigger-x');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('moves the highlight with the arrow keys and skips disabled items', async () => {
    setup();
    open();
    const rename = screen.getByRole('menuitem', { name: 'Rename' });
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    await waitFor(() => expect(rename.hasAttribute('data-highlighted')).toBe(true));
    // Radix roving focus reads the key on the focused item, not on the menu.
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    await waitFor(() => expect(del.hasAttribute('data-highlighted')).toBe(true));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Locked' }).hasAttribute('data-highlighted')).toBe(false);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    await waitFor(() => expect(rename.hasAttribute('data-highlighted')).toBe(true));
  });

  it('fires onSelect on Enter and closes the menu', async () => {
    const onSelect = vi.fn();
    setup({ onSelect });
    open();
    const rename = screen.getByRole('menuitem', { name: 'Rename' });
    await waitFor(() => expect(rename.hasAttribute('data-highlighted')).toBe(true));
    fireEvent.keyDown(rename, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    setup();
    const trigger = open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('forwards onCloseAutoFocus', async () => {
    const onCloseAutoFocus = vi.fn();
    setup({ onCloseAutoFocus });
    open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });

  it('uses the app menu surface and a caller width class last', () => {
    setup();
    open();
    const cls = screen.getByRole('menu').className;
    for (const part of ['anim-swap', 'z-(--z-popover)', 'rounded-md', 'border-border', 'bg-surface', 'p-1', 'shadow-md']) {
      expect(cls).toContain(part);
    }
    expect(cls.endsWith('w-40')).toBe(true);
  });

  it('gives an item the app item class; destructive adds text-danger, plain does not', () => {
    setup();
    open();
    const plain = screen.getByRole('menuitem', { name: 'Rename' }).className;
    expect(plain).toContain('h-8');
    expect(plain).toContain('data-[highlighted]:bg-(--state-hover)');
    expect(plain).not.toContain('text-danger');
    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain('text-danger');
  });

  it('marks a disabled item aria-disabled', () => {
    setup();
    open();
    expect(screen.getByRole('menuitem', { name: 'Locked' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('renders a link through asChild', () => {
    setup();
    open();
    const link = screen.getByRole('menuitem', { name: 'Profile' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/profile');
    expect(link.className).toContain('h-8');
  });

  it('renders a separator and a label with the app classes', () => {
    setup();
    open();
    expect(screen.getByRole('separator').className).toContain('my-1 h-px bg-border');
    expect(screen.getByText('Section').className).toContain('text-text-tertiary');
  });
});
