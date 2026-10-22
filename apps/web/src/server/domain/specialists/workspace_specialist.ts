import type { AccentKey, SpecialistCopyByLocale } from '@/shared/specialists/manifest';
import type { AgentCategory, CatalogStatus } from './agent_catalog';

export type SpecialistAccess = 'available' | 'unavailable';

/** One specialist as the roster route returns it: availability from sineva-ai, presentation from the manifest. */
export interface WorkspaceSpecialist {
  agent_slug: string;
  handle: string;
  display_name: string;
  category: AgentCategory;
  wave: number;
  status: CatalogStatus;
  /** Derived in M0 (see the OpenAPI description); becomes a stored workspace setting with `workspace_specialists`. */
  enabled: boolean;
  accent_key: AccentKey;
  room_theme_id: string;
  order: number;
  copy: SpecialistCopyByLocale;
  my_access: SpecialistAccess;
}

export interface WorkspaceSpecialistRoster {
  catalog_version: string;
  items: WorkspaceSpecialist[];
}
