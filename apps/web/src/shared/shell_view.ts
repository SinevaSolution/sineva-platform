import type { LocalizedSpecialist } from './specialists/manifest';

// Serializable props the app shell receives from server layouts. Built by
// explicit mapping in `app/w/[workspace_slug]/layout.tsx`, never by passing
// server entities through.

export interface ShellWorkspaceView {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export interface ShellUserView {
  name: string;
  email: string;
}

// Presentation only, one language already picked (see `localizeSpecialists`).
// The shell does not know whether a specialist is available: that is sineva-ai's
// answer, served by the roster route.
export type ShellSpecialistView = LocalizedSpecialist;
