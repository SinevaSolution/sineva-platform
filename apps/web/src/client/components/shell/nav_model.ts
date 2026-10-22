// Pure navigation model for the app sidebar. Kept free of React so it can be
// unit tested and shared by the desktop sidebar, the icon rail and the
// mobile drawer.
//
// Every planned v1 feature is listed so people can see where the product is
// going. Ones not built yet carry `soon` and open a "coming soon" page, not
// a dead link (Founder decision 2026-10-22, replaces FR-SHELL-03's "no item
// until shipped"). Specialists are not in the sidebar: they are picked on
// Home and New chat.

import { specialistPose, type SinoPose } from '@/client/components/ui/specialist_accent';

export type NavIcon =
  | 'home'
  | 'new-chat'
  | 'inbox'
  | 'customers'
  | 'squads'
  | 'library'
  | 'tools'
  | 'workflows'
  | 'routines'
  | 'skills'
  | 'settings';

export const FEATURES = {
  inbox: {
    id: 'inbox',
    segment: 'inbox',
    labelKey: 'features.inbox.label',
    icon: 'inbox',
    blurbKey: 'features.inbox.blurb',
  },
  // Customer conversations from connected channels (WhatsApp, Instagram,
  // Facebook), with SinoHelp drafts and human takeover (WP-M3-44, D-M3-9).
  customers: {
    id: 'customers',
    segment: 'customers',
    labelKey: 'features.customers.label',
    icon: 'customers',
    blurbKey: 'features.customers.blurb',
  },
  squads: {
    id: 'squads',
    segment: 'squads',
    labelKey: 'features.squads.label',
    icon: 'squads',
    blurbKey: 'features.squads.blurb',
  },
  library: {
    id: 'library',
    segment: 'library',
    labelKey: 'features.library.label',
    icon: 'library',
    blurbKey: 'features.library.blurb',
  },
  tools: {
    id: 'tools',
    segment: 'tools',
    labelKey: 'features.tools.label',
    icon: 'tools',
    blurbKey: 'features.tools.blurb',
  },
  workflows: {
    id: 'workflows',
    segment: 'workflows',
    labelKey: 'features.workflows.label',
    icon: 'workflows',
    blurbKey: 'features.workflows.blurb',
  },
  routines: {
    id: 'routines',
    segment: 'routines',
    labelKey: 'features.routines.label',
    icon: 'routines',
    blurbKey: 'features.routines.blurb',
  },
  skills: {
    id: 'skills',
    segment: 'skills',
    labelKey: 'features.skills.label',
    icon: 'skills',
    blurbKey: 'features.skills.blurb',
  },
  settings: {
    id: 'settings',
    segment: 'settings',
    labelKey: 'features.settings.label',
    icon: 'settings',
    blurbKey: 'features.settings.blurb',
  },
} as const satisfies Record<string, { id: string; segment: string; labelKey: string; icon: NavIcon; blurbKey: string }>;

export type FeatureId = keyof typeof FEATURES;

export interface NavItem {
  id: string;
  /** Key in the `shell` namespace. */
  labelKey: string;
  href: string;
  icon: NavIcon;
  /** Home matches only its own path; everything else matches nested paths. */
  exact: boolean;
  /** Planned, not built yet: opens the coming-soon page. */
  soon: boolean;
}

export interface NavSection {
  id: 'primary' | 'workspace' | 'automate';
  /** Key in the `shell` namespace; null for the unlabelled first group. */
  labelKey: string | null;
  items: NavItem[];
}

export function featureBySegment(segment: string) {
  return (Object.values(FEATURES) as (typeof FEATURES)[FeatureId][]).find((f) => f.segment === segment) ?? null;
}

export function buildNavSections(workspaceSlug: string): NavSection[] {
  const base = `/w/${workspaceSlug}`;
  const feature = (id: FeatureId): NavItem => ({
    id,
    labelKey: FEATURES[id].labelKey,
    href: `${base}/${FEATURES[id].segment}`,
    icon: FEATURES[id].icon,
    exact: false,
    soon: true,
  });
  return [
    {
      id: 'primary',
      labelKey: null,
      items: [
        { id: 'home', labelKey: 'nav.home', href: base, icon: 'home', exact: true, soon: false },
        { id: 'new', labelKey: 'nav.new_chat', href: `${base}/new`, icon: 'new-chat', exact: false, soon: false },
        feature('inbox'),
        feature('customers'),
      ],
    },
    { id: 'workspace', labelKey: 'sections.workspace', items: [feature('squads'), feature('library'), feature('tools')] },
    { id: 'automate', labelKey: 'sections.automate', items: [feature('workflows'), feature('routines'), feature('skills')] },
  ];
}

export function isNavItemActive(pathname: string, href: string, exact: boolean): boolean {
  if (pathname === href) return true;
  if (exact) return false;
  return pathname.startsWith(`${href}/`);
}

/**
 * Who a recent chat is with: the whole team (Sino hub) or one specialist.
 * `name` is the specialist's display name, or null when the label is the
 * generic "Team" or "Specialist" text, which the caller translates.
 */
export function chatMarker(
  chat: { kind: string; agent_slug: string | null },
  names: Record<string, string>,
): { kind: 'team' | 'specialist'; name: string | null; pose: SinoPose } {
  if (chat.kind !== 'room' || !chat.agent_slug) return { kind: 'team', name: null, pose: 'wave' };
  return { kind: 'specialist', name: names[chat.agent_slug] ?? null, pose: specialistPose(chat.agent_slug) };
}

export const SIDEBAR_COOKIE = 'sineva_sidebar';

export function parseSidebarCookie(value: string | undefined): boolean {
  return value === 'collapsed';
}
