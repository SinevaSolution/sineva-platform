export type WorkspaceTier = 'starter' | 'growth' | 'enterprise';

export interface WorkspaceEntity {
  id: string;
  workspace_slug: string;
  workspace_name: string;
  subscription_tier: WorkspaceTier;
  monthly_token_quota: number;
  monthly_tokens_consumed: number;
  created_at: string;
  updated_at: string;
}
