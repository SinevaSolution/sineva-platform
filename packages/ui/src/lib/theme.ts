/**
 * Light and dark theme. The first visit follows the operating system; an
 * explicit choice is stored on the device and wins over the system. The
 * resolved theme lives in `<html data-theme>`, which `theme-dark.css` keys on.
 *
 * Ported from sineva-compro (`src/lib/theme/theme.ts`) instead of configuring
 * `next-themes`: the compro script is one line of dependency-free JavaScript
 * with the exact storage key and attribute the token CSS expects, and it
 * avoids a client component that renders a `<script>` (React 19 warns on it).
 */
export const THEME_STORAGE_KEY = 'sineva-theme';
export type Theme = 'light' | 'dark';

/**
 * Runs in `<head>` before the first paint, so the page never flashes the other
 * theme. Dependency free; storage access is guarded because private modes and
 * blocked-cookie settings throw. The string holds no `</`, so it can sit
 * inside a `<script>` element unescaped.
 */
export const THEME_SCRIPT = `(function(){try{var s=null;try{s=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}var t=s==='light'||s==='dark'?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t}catch(e){}})()`;

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, persist = true): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  if (!persist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only.
  }
}

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}
