export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface UserEntity {
  id: string;
  workspace_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
