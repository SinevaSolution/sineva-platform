// JSON contract for `/api/v1/me` and `/api/v1/me/profile` as the browser sees
// it. The server entity must stay assignable to this view
// (`server/http/profile_view_contract.ts`).

export type SalutationView = 'none' | 'pak' | 'bu' | 'kak' | 'mas' | 'mbak';
export type DepartmentView =
  | 'management'
  | 'finance'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'hr'
  | 'it'
  | 'customer_support'
  | 'legal'
  | 'other';

export interface ProfileView {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  preferred_name: string | null;
  salutation: SalutationView | null;
  phone_number: string | null;
  phone_verified: boolean;
  about_me: string | null;
  use_profile_in_context: boolean;
  /** Authenticated own-avatar route with a cache-busting version, or null. */
  avatar_url: string | null;
  locale: string;
  timezone: string;
  created_at: string;
}

export interface MembershipView {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  role: string;
  job_title: string | null;
  department: DepartmentView | null;
}

export interface MeView extends ProfileView {
  memberships: MembershipView[];
}

export interface MemberProfileView {
  job_title: string | null;
  department: DepartmentView | null;
}

export interface PreferencesView {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  focus_mode: boolean;
  reduce_motion: boolean;
  sidebar_collapsed: boolean;
  pause_character: boolean;
  room_view: boolean;
}

export interface AvatarUploadTicketView {
  upload_id: string;
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_in_seconds: number;
  max_bytes: number;
}
