export type WorkspaceTier = 'starter' | 'growth' | 'enterprise';

export type WorkspaceStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'read_only'
  | 'suspended'
  | 'pending_deletion'
  | 'deleted';

export interface WorkspaceEntity {
  id: string;
  workspace_slug: string;
  workspace_name: string;
  owner_user_id: string | null;
  status: WorkspaceStatus;
  status_reason: string | null;
  trial_ends_at: string | null;
  timezone: string;
  default_locale: string;
  logo_url: string | null;
  slug_changed_at: string | null;
  subscription_tier: WorkspaceTier;
  monthly_token_quota: number;
  monthly_tokens_consumed: number;
  created_at: string;
  updated_at: string;
}
