import { SettingsFrame } from '@/client/components/settings/settings_frame';
import { loadWorkspaceContext } from '../workspace_context';

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);
  return (
    <SettingsFrame workspaceSlug={workspace_slug} role={ctx.workspace.role}>
      {children}
    </SettingsFrame>
  );
}
