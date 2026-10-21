// JSON contract for agents as the browser sees them (the shape returned by
// `/api/v1/agents`). This is deliberately separate from the domain
// `AgentEntity`: client code may import this file, but never `@/server/*`,
// so the backend can reshape its entities without dragging server modules
// into the client bundle. `server/http/agent_view_contract.ts` fails the
// type-check if the entity stops being assignable to this view.

export type AgentCategory =
  | 'people_hr'
  | 'finance_ops'
  | 'sales_growth'
  | 'social_marketing'
  | 'customer_support'
  | 'data_insights';

export type AgentStatus = 'online' | 'standby' | 'busy' | 'maintenance';

export interface AgentView {
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
