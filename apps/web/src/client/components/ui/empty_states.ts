import {
  Lightbulb,
  ListChecks,
  KeyRound,
  MailPlus,
  MessagesSquare,
  Package,
  ScrollText,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { SNSinoStillPose } from '@sineva/ui';

/**
 * Every place in the app that can be empty, in one table. A preset says what
 * the place shows (a lucide icon for compact places, a Sino pose for whole
 * pages), how big it is, and which messages it reads from the `empty`
 * namespace.
 *
 * Message keys are spelled out as string literals on purpose: the key-usage
 * test follows literals, and a template like `${name}.title` would hide the
 * keys from it (and from anyone searching the catalogs).
 *
 * Add a place here and in both catalogs; `empty_states.test.ts` fails when
 * either language is missing a key, and `empty_state_usage.test.ts` fails when
 * a screen writes its own empty text instead.
 */
export interface EmptyPreset {
  /** Compact places: sidebar, lists, drawers, menus. */
  icon?: LucideIcon;
  /** Whole pages and big panels. */
  pose?: SNSinoStillPose;
  size: 'sm' | 'md' | 'lg';
  title: string;
  description: string;
  /** Label of the one optional call to action. It shows only when the screen gives the action a target. */
  action?: string;
  /** Values the gallery fills into `{placeholders}`. */
  sample?: Record<string, string>;
}

// `satisfies` keeps each entry's literal keys; `Record<string, EmptyPreset>` would widen the ids.
export const EMPTY_STATES = {
  sidebar_recent: {
    icon: MessagesSquare,
    size: 'sm',
    title: 'sidebar_recent.title',
    description: 'sidebar_recent.description',
  },
  home_recent: {
    icon: MessagesSquare,
    size: 'md',
    title: 'home_recent.title',
    description: 'home_recent.description',
    action: 'home_recent.action',
  },
  home_ideas: {
    icon: Lightbulb,
    size: 'sm',
    title: 'home_ideas.title',
    description: 'home_ideas.description',
  },
  chat_thread_empty: {
    pose: 'wave',
    size: 'md',
    title: 'chat_thread_empty.title',
    description: 'chat_thread_empty.description',
  },
  chat_deleted: {
    pose: 'confused',
    size: 'lg',
    title: 'chat_deleted.title',
    description: 'chat_deleted.description',
    action: 'chat_deleted.action',
  },
  chat_load_failed: {
    pose: 'confused',
    size: 'lg',
    title: 'chat_load_failed.title',
    description: 'chat_load_failed.description',
    action: 'chat_load_failed.action',
  },
  new_chat_starters: {
    icon: Sparkles,
    size: 'sm',
    title: 'new_chat_starters.title',
    description: 'new_chat_starters.description',
  },
  mention_no_match: {
    icon: Search,
    size: 'sm',
    title: 'mention_no_match.title',
    description: 'mention_no_match.description',
    sample: { query: 'sin' },
  },
  members_list: {
    icon: Users,
    size: 'sm',
    title: 'members_list.title',
    description: 'members_list.description',
  },
  members_invitations: {
    icon: MailPlus,
    size: 'sm',
    title: 'members_invitations.title',
    description: 'members_invitations.description',
  },
  business_offerings: {
    icon: Package,
    size: 'sm',
    title: 'business_offerings.title',
    description: 'business_offerings.description',
  },
  business_policies: {
    icon: ScrollText,
    size: 'sm',
    title: 'business_policies.title',
    description: 'business_policies.description',
  },
  onboarding_tasks: {
    icon: ListChecks,
    size: 'sm',
    title: 'onboarding_tasks.title',
    description: 'onboarding_tasks.description',
  },
  sign_in_methods_none: {
    icon: KeyRound,
    size: 'sm',
    title: 'sign_in_methods_none.title',
    description: 'sign_in_methods_none.description',
  },
  coming_soon: {
    pose: 'thumbs-up',
    size: 'lg',
    title: 'coming_soon.title',
    description: 'coming_soon.description',
    action: 'coming_soon.action',
    sample: { title: 'Workflows' },
  },
  not_found: {
    pose: 'confused',
    size: 'lg',
    title: 'not_found.title',
    description: 'not_found.description',
    action: 'not_found.action',
  },
  workspace_error: {
    pose: 'confused',
    size: 'lg',
    title: 'workspace_error.title',
    description: 'workspace_error.description',
    action: 'workspace_error.action',
  },
} as const satisfies Record<string, EmptyPreset>;

export type EmptyStateName = keyof typeof EMPTY_STATES;

/** Every message key (inside the `empty` namespace) a preset reads. */
export function emptyStateKeys(preset: EmptyPreset): string[] {
  return [preset.title, preset.description, ...(preset.action ? [preset.action] : [])];
}
