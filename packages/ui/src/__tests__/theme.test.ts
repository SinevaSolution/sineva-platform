// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  applyThemePreference,
  readThemePreference,
  readTheme,
  storedTheme,
} from '../lib/theme';

function setSystemDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

// The inline script is a string that runs before the first paint, so the tests
// execute it the way the browser does: as a bare function body.
const runScript = () => new Function(THEME_SCRIPT)();
const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('data-theme');
  root().style.colorScheme = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('theme script (FR-UX-06)', () => {
  it('stores the choice under the sineva-theme key', () => {
    expect(THEME_STORAGE_KEY).toBe('sineva-theme');
  });

  it('follows the operating system on the first visit', () => {
    setSystemDark(true);
    runScript();
    expect(root().getAttribute('data-theme')).toBe('dark');
    setSystemDark(false);
    runScript();
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('lets a stored choice win over the system', () => {
    setSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runScript();
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    setSystemDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    runScript();
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('still sets the theme when storage access throws', () => {
    setSystemDark(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(runScript).not.toThrow();
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('sets color-scheme so native controls follow the theme', () => {
    setSystemDark(true);
    runScript();
    expect(root().style.colorScheme).toBe('dark');
  });

  it('cannot close its own script tag', () => {
    expect(THEME_SCRIPT).not.toContain('</');
  });
});

describe('theme helpers', () => {
  it('reads light when nothing is set', () => {
    expect(readTheme()).toBe('light');
  });

  it('applies and persists a choice', () => {
    applyTheme('dark');
    expect(readTheme()).toBe('dark');
    expect(storedTheme()).toBe('dark');
  });

  it('applies without persisting when asked (OS change while following the system)', () => {
    applyTheme('dark', false);
    expect(readTheme()).toBe('dark');
    expect(storedTheme()).toBeNull();
  });

  it('survives blocked storage on write and read', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(readTheme()).toBe('dark');
    expect(storedTheme()).toBeNull();
  });
});

describe('theme preference (light, dark or system)', () => {
  it('reads system when no choice is stored, and the stored choice otherwise', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readThemePreference()).toBe('dark');
  });

  it('light and dark are applied and stored', () => {
    applyThemePreference('dark');
    expect(readTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('system forgets the stored choice and follows the operating system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    setSystemDark(true);
    applyThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readTheme()).toBe('dark');
    expect(readThemePreference()).toBe('system');
  });

  it('notifies listeners so a preference-only change re-renders', () => {
    let calls = 0;
    const listener = () => (calls += 1);
    window.addEventListener('sineva-theme-change', listener);
    applyThemePreference('light');
    window.removeEventListener('sineva-theme-change', listener);
    expect(calls).toBe(1);
  });
});
