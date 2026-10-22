import { redirect } from 'next/navigation';

// A specialist's private chat starts on New chat with them picked, so old
// links and bookmarks keep working.
export default async function SpecialistPage({
  params,
}: {
  params: Promise<{ workspace_slug: string; agent_slug: string }>;
}) {
  const { workspace_slug, agent_slug } = await params;
  redirect(`/w/${workspace_slug}/new?with=${encodeURIComponent(agent_slug)}`);
}
