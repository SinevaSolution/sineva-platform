export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export type UserStatus = 'active' | 'suspended' | 'pending_deletion' | 'deleted';

export type Salutation = 'none' | 'pak' | 'bu' | 'kak' | 'mas' | 'mbak';

export type WorkspaceStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'read_only'
  | 'suspended'
  | 'pending_deletion'
  | 'deleted';

export interface UserEntity {
  id: string;
  email: string;
  full_name: string;
  preferred_name: string | null;
  salutation: Salutation | null;
  phone_number: string | null;
  phone_verified_at: string | null;
  locale: string;
  timezone: string;
  about_me: string | null;
  use_profile_in_context: boolean;
  avatar_url: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  status: UserStatus;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberEntity {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  specialist_scope: 'all' | 'selected';
  job_title: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
}
