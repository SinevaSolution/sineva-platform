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

export interface ShellSpecialistView {
  agent_slug: string;
  display_name: string;
  role_title: string;
  short_description: string;
}
