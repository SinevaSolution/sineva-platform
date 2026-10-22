import type { GoalKey } from '@/server/domain/business_profile/business_profile';
import type { BusinessType, DismissedTask } from './first_task_catalog';

export const OWNER_STEP_COUNT = 5;
export const MEMBER_STEP_COUNT = 2;

/** Steps that have no "Skip for now": language and business name (FR-ONB-01). */
export const UNSKIPPABLE_OWNER_STEPS: readonly number[] = [1, 2];
export const UNSKIPPABLE_MEMBER_STEPS: readonly number[] = [1];

export type OnboardingFlow = 'owner' | 'member';
export type OnboardingStatus = 'in_progress' | 'completed' | 'abandoned';

export const TEAM_SIZES = ['solo', '2_5', '6_20', '21_50', '50_plus'] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

/**
 * Collected answers. Instagram and marketplace inputs are links and handles
 * only (FR-ONB-13); nothing here is read from those pages. About-you values
 * are collected, their rules and visibility belong to the account profile.
 */
export interface OnboardingAnswers {
  language?: 'id' | 'en';
  about_you?: {
    preferred_name?: string | null;
    salutation?: string | null;
    job_title?: string | null;
    department?: string | null;
    phone_number?: string | null;
  };
  business_name?: string;
  business_type?: BusinessType;
  team_size?: TeamSize;
  city?: string | null;
  province?: string | null;
  website_url?: string | null;
  instagram_handle?: string | null;
  marketplace_url?: string | null;
  goals?: GoalKey[];
  /** True once the provisional slug was regenerated from the business name. */
  slug_regenerated?: boolean;
}

export interface OnboardingStateEntity {
  /** Null while nothing was saved yet (a read never writes). */
  id: string | null;
  workspace_id: string;
  user_id: string;
  flow: OnboardingFlow;
  status: OnboardingStatus;
  current_step: number;
  answers: OnboardingAnswers;
  skipped_steps: number[];
  dismissed_tasks: DismissedTask[];
  started_at: string | null;
  completed_at: string | null;
  persisted: boolean;
}

export const CHECKLIST_ITEMS = [
  'confirm_profile',
  'add_library_documents',
  'connect_tool',
  'invite_teammate',
  'choose_autonomy',
] as const;
export type ChecklistItemKey = (typeof CHECKLIST_ITEMS)[number];

export interface ChecklistItemState {
  item_key: ChecklistItemKey;
  status: 'done' | 'pending';
  completed_at: string | null;
}

/** Name given to the workspace created for a first sign-up, stored in both languages. */
export const PROVISIONAL_WORKSPACE_NAME: Record<'en' | 'id', string> = {
  en: 'My workspace',
  id: 'Workspace saya',
};
