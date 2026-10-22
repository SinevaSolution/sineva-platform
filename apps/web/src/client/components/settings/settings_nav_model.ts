// Pure navigation model for the Settings area. Free of React so the settings
// nav, the hub cards and the tests read the same list.
//
// Every planned item is listed so people see where Settings is going. Planned
// ones carry `soon` and have no `href`: they render as disabled rows, never as
// a link to a page that does not exist.

import { parseSettingsTab, settingsTabHref, type SettingsTab } from './settings_tabs';

export type SettingsGroupId = 'account' | 'workspace';

export type SettingsItemId =
  | 'profile'
  | 'preferences'
  | 'sign_in'
  | 'business'
  | 'members'
  | 'usage'
  | 'tools'
  | 'models'
  | 'billing'
  | 'security';

export type SettingsIconName =
  | 'user'
  | 'sliders'
  | 'key'
  | 'building'
  | 'users'
  | 'gauge'
  | 'plug'
  | 'sparkles'
  | 'credit-card'
  | 'shield';

export interface SettingsNavItem {
  id: SettingsItemId;
  group: SettingsGroupId;
  /** Keys in the `settings_ui` namespace. */
  labelKey: string;
  descriptionKey: string;
  icon: SettingsIconName;
  /** Null for a planned item. */
  href: string | null;
  soon: boolean;
}

export interface SettingsNavGroup {
  id: SettingsGroupId;
  /** Key in the `settings_ui` namespace. */
  labelKey: string;
  items: SettingsNavItem[];
}

const MANAGER_ROLES = ['owner', 'admin'];

export function isSettingsManager(role: string): boolean {
  return MANAGER_ROLES.includes(role);
}

// Message keys are literals (not built from the id) so the unused-key check
// can see them.
const COPY: Record<SettingsItemId, { labelKey: string; descriptionKey: string; icon: SettingsIconName }> = {
  profile: { labelKey: 'items.profile.label', descriptionKey: 'items.profile.description', icon: 'user' },
  preferences: {
    labelKey: 'items.preferences.label',
    descriptionKey: 'items.preferences.description',
    icon: 'sliders',
  },
  sign_in: { labelKey: 'items.sign_in.label', descriptionKey: 'items.sign_in.description', icon: 'key' },
  business: {
    labelKey: 'items.business.label',
    descriptionKey: 'items.business.description',
    icon: 'building',
  },
  members: { labelKey: 'items.members.label', descriptionKey: 'items.members.description', icon: 'users' },
  usage: { labelKey: 'items.usage.label', descriptionKey: 'items.usage.description', icon: 'gauge' },
  tools: { labelKey: 'items.tools.label', descriptionKey: 'items.tools.description', icon: 'plug' },
  models: { labelKey: 'items.models.label', descriptionKey: 'items.models.description', icon: 'sparkles' },
  billing: {
    labelKey: 'items.billing.label',
    descriptionKey: 'items.billing.description',
    icon: 'credit-card',
  },
  security: {
    labelKey: 'items.security.label',
    descriptionKey: 'items.security.description',
    icon: 'shield',
  },
};

// `business` and `members` stay visible to every role on purpose: both pages
// have a read-only mode (business_profile.view and the member directory are
// open to all roles), so hiding them would hide a screen that works. The
// planned items would be owner/admin tools, so other roles do not see them.
export function buildSettingsNav(workspaceSlug: string, role: string): SettingsNavGroup[] {
  const base = `/w/${workspaceSlug}/settings`;
  const manager = isSettingsManager(role);
  const item = (id: SettingsItemId, group: SettingsGroupId, href: string | null): SettingsNavItem => ({
    id,
    group,
    ...COPY[id],
    href,
    soon: href === null,
  });
  const account = (id: SettingsTab) => item(id, 'account', settingsTabHref(workspaceSlug, id));
  const live = (id: 'business' | 'members') => item(id, 'workspace', `${base}/${id}`);
  const soon = (id: SettingsItemId) => item(id, 'workspace', null);
  return [
    {
      id: 'account',
      labelKey: 'groups.account',
      items: [account('profile'), account('preferences'), account('sign_in')],
    },
    {
      id: 'workspace',
      labelKey: 'groups.workspace',
      items: [
        live('business'),
        live('members'),
        // Connected tools has its own section outside /settings (WP-M2-18).
        item('tools', 'workspace', `/w/${workspaceSlug}/tools`),
        ...(manager ? [soon('usage'), soon('models'), soon('billing'), soon('security')] : []),
      ],
    },
  ];
}

/** Which nav item a settings URL belongs to; null on the hub itself. */
export function activeSettingsItem(pathname: string, tab: string | null): SettingsItemId | null {
  if (/\/settings\/members(\/|$)/.test(pathname)) return 'members';
  if (/\/settings\/business(\/|$)/.test(pathname)) return 'business';
  if (/\/settings\/profile(\/|$)/.test(pathname)) return parseSettingsTab(tab ?? undefined);
  return null;
}

const FILLED_KEYS = [
  'display_name',
  'legal_name',
  'industry',
  'city',
  'province',
  'languages',
  'website_url',
  'social_handles',
  'business_hours',
  'brand_voice',
  'audience',
  'goals',
] as const;

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

/** Share of Business Profile fields that have a value, as a whole percent. */
export function businessProfileCompleteness(fields: Record<(typeof FILLED_KEYS)[number], unknown>): number {
  const filled = FILLED_KEYS.filter((key) => isFilled(fields[key])).length;
  return Math.round((filled / FILLED_KEYS.length) * 100);
}
