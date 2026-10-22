// What sineva-ai says about its specialists (`GET /api/v2/agents`). The
// platform reads availability from here and display copy from the manifest
// (ADR-0024); it never creates or edits a specialist.

// The six original categories plus the ones the Roster PRD (section 5) adds
// for waves 2 and 3. A category this list does not know is a contract
// violation (502), not a value to pass through.
export const AGENT_CATEGORIES = [
  'people_hr',
  'finance_ops',
  'sales_growth',
  'social_marketing',
  'customer_support',
  'data_insights',
  'personal_ops',
  'content_studio',
  'marketplace_ops',
  'it_security',
  'tax_compliance',
  'legal_drafting',
  'inventory_procurement',
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export type CatalogStatus = 'live' | 'coming_soon';

export interface CatalogAgent {
  agent_slug: string;
  /** Display form of the name ("SinoFinance"), not the @mention. */
  handle: string;
  category: AgentCategory;
  wave: number;
  status: CatalogStatus;
}

export interface AgentCatalog {
  /** Changes whenever a catalog entry changes; the platform memoizes its merge by it. */
  catalog_version: string;
  agents: CatalogAgent[];
}
