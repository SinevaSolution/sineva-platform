import type { PreferencesView } from '@/shared/profile_view';

// Pure decisions behind the theme and sidebar sync, kept out of the effects so
// the rules can be tested without a browser.

/**
 * Which theme, if any, to apply from the server preference at session start.
 *
 * `system` is the stored default and also what a person who chose "System"
 * has, so it cannot tell "never chose" from "chose system". Applying it would
 * override a theme this device already has (a person who toggled dark before
 * preferences existed), so it is ignored; an explicit light or dark wins.
 * Once per session: after that the person's local toggles are the truth and
 * are pushed to the server as they happen.
 */
export function themeToApply(input: {
  stored: PreferencesView['theme'];
  local: string | undefined;
  alreadySynced: boolean;
}): 'light' | 'dark' | null {
  if (input.alreadySynced || input.stored === 'system') {
    return null;
  }
  return input.stored === input.local ? null : input.stored;
}

/** The cookie is the fast path; it is written from the stored preference only when it does not exist yet (a new device). */
export function collapsedCookieNeedsSeed(cookieString: string): boolean {
  return !/(?:^|;\s*)sineva_sidebar=/.test(cookieString);
}
