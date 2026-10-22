// Tabs of the account settings page (FR-AUTH-07). The tab is in the URL
// (`?tab=`), so a reload or a shared link lands on the same one.

export const SETTINGS_TABS = ['profile', 'preferences', 'sign_in'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'profile';

/** Anything that is not a known tab (missing, repeated, misspelled) is the default. */
export function parseSettingsTab(value: string | string[] | undefined): SettingsTab {
  const first = Array.isArray(value) ? value[0] : value;
  return (SETTINGS_TABS as readonly string[]).includes(first ?? '') ? (first as SettingsTab) : DEFAULT_SETTINGS_TAB;
}

export function settingsTabHref(workspaceSlug: string, tab: SettingsTab): string {
  const base = `/w/${workspaceSlug}/settings/profile`;
  return tab === DEFAULT_SETTINGS_TAB ? base : `${base}?tab=${tab}`;
}
