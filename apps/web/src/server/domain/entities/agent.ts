export type AgentCategory =
  | 'people_hr'
  | 'finance_ops'
  | 'sales_growth'
  | 'social_marketing'
  | 'customer_support'
  | 'data_insights';

export type AgentStatus = 'online' | 'standby' | 'busy' | 'maintenance';

export interface AgentEntity {
  id: string;
  agent_slug: string;
  display_name: string;
  role_title: string;
  category: AgentCategory;
  status: AgentStatus;
  short_description: string;
  capabilities: string[];
  model_name: string;
  avg_latency_ms: number;
  active_sessions_count: number;
  daily_tokens_used: number;
  accent_token: string;
  created_at: string;
  updated_at: string;
}
