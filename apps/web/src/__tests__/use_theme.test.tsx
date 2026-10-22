// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTheme } from '@/client/lib/use_theme';
import { THEME_STORAGE_KEY } from '@sineva/ui/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute('data-theme', 'light');
});
afterEach(() => localStorage.clear());

describe('useTheme (FR-UX-06)', () => {
  it('reads the theme the inline script put on <html>', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('switches the theme, stores the choice and re-renders', async () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    await act(async () => {
      result.current.setTheme('dark');
      // The MutationObserver notifies on a microtask.
      await Promise.resolve();
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(result.current.theme).toBe('dark');
  });

  it('toggles between the two themes', async () => {
    const { result } = renderHook(() => useTheme());
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(result.current.theme).toBe('dark');
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(result.current.theme).toBe('light');
  });
});
