// JSON contract of `GET /api/v1/workspaces/{workspace_id}/agents` as the
// browser sees it. Separate from the domain `WorkspaceSpecialist` so client code
// never imports `@/server/*`; `server/http/specialist_view_contract.ts` fails the
// type-check if the domain type stops being assignable to this view.
import type { AccentKey, SpecialistCopyByLocale } from './specialists/manifest';

export type SpecialistCategoryView =
  | 'people_hr'
  | 'finance_ops'
  | 'sales_growth'
  | 'social_marketing'
  | 'customer_support'
  | 'data_insights'
  | 'personal_ops'
  | 'content_studio'
  | 'marketplace_ops'
  | 'it_security'
  | 'tax_compliance'
  | 'legal_drafting'
  | 'inventory_procurement';

export interface WorkspaceSpecialistView {
  agent_slug: string;
  handle: string;
  display_name: string;
  category: SpecialistCategoryView;
  wave: number;
  status: 'live' | 'coming_soon';
  enabled: boolean;
  accent_key: AccentKey;
  room_theme_id: string;
  order: number;
  copy: SpecialistCopyByLocale;
  my_access: 'available' | 'unavailable';
}

export interface WorkspaceSpecialistRosterView {
  catalog_version: string;
  items: WorkspaceSpecialistView[];
}
