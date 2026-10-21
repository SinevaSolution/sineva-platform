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
    label: 'Inbox',
    icon: 'inbox',
    blurb: 'Drafts waiting for your OK, and updates from your specialists, in one place.',
  },
  squads: {
    id: 'squads',
    segment: 'squads',
    label: 'Squads',
    icon: 'squads',
    blurb: 'Put specialists together as a squad that works on one goal.',
  },
  library: {
    id: 'library',
    segment: 'library',
    label: 'Sino Library',
    icon: 'library',
    blurb: 'Your files and notes, so Sino answers with what your business already knows.',
  },
  tools: {
    id: 'tools',
    segment: 'tools',
    label: 'Connected tools',
    icon: 'tools',
    blurb: 'Connect the tools you already use so specialists can work inside them.',
  },
  workflows: {
    id: 'workflows',
    segment: 'workflows',
    label: 'Workflows',
    icon: 'workflows',
    blurb: 'Chain steps across specialists and tools, with your approval where it matters.',
  },
  routines: {
    id: 'routines',
    segment: 'routines',
    label: 'Routines',
    icon: 'routines',
    blurb: 'Jobs that run on a schedule, like a Monday sales recap.',
  },
  skills: {
    id: 'skills',
    segment: 'skills',
    label: 'Skills',
    icon: 'skills',
    blurb: 'Teach a specialist how your business does a task, once.',
  },
  settings: {
    id: 'settings',
    segment: 'settings',
    label: 'Settings',
    icon: 'settings',
    blurb: 'Workspace, members, models and billing.',
  },
} as const satisfies Record<string, { id: string; segment: string; label: string; icon: NavIcon; blurb: string }>;

export type FeatureId = keyof typeof FEATURES;

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: NavIcon;
  /** Home matches only its own path; everything else matches nested paths. */
  exact: boolean;
  /** Planned, not built yet: opens the coming-soon page. */
  soon: boolean;
}

export interface NavSection {
  id: 'primary' | 'workspace' | 'automate';
  label: string | null;
  items: NavItem[];
}

export function featureBySegment(segment: string) {
  return (Object.values(FEATURES) as (typeof FEATURES)[FeatureId][]).find((f) => f.segment === segment) ?? null;
}

export function buildNavSections(workspaceSlug: string): NavSection[] {
  const base = `/w/${workspaceSlug}`;
  const feature = (id: FeatureId): NavItem => ({
    id,
    label: FEATURES[id].label,
    href: `${base}/${FEATURES[id].segment}`,
    icon: FEATURES[id].icon,
    exact: false,
    soon: true,
  });
  return [
    {
      id: 'primary',
      label: null,
      items: [
        { id: 'home', label: 'Home', href: base, icon: 'home', exact: true, soon: false },
        { id: 'new', label: 'New chat', href: `${base}/new`, icon: 'new-chat', exact: false, soon: false },
        feature('inbox'),
      ],
    },
    { id: 'workspace', label: 'Workspace', items: [feature('squads'), feature('library'), feature('tools')] },
    { id: 'automate', label: 'Automate', items: [feature('workflows'), feature('routines'), feature('skills')] },
  ];
}

export function isNavItemActive(pathname: string, href: string, exact: boolean): boolean {
  if (pathname === href) return true;
  if (exact) return false;
  return pathname.startsWith(`${href}/`);
}

/** Who a recent chat is with: the whole team (Sino hub) or one specialist. */
export function chatMarker(
  chat: { kind: string; agent_slug: string | null },
  names: Record<string, string>,
): { label: string; pose: SinoPose } {
  if (chat.kind !== 'room' || !chat.agent_slug) return { label: 'Team', pose: 'wave' };
  return { label: names[chat.agent_slug] ?? 'Specialist', pose: specialistPose(chat.agent_slug) };
}

export const SIDEBAR_COOKIE = 'sineva_sidebar';

export function parseSidebarCookie(value: string | undefined): boolean {
  return value === 'collapsed';
}
