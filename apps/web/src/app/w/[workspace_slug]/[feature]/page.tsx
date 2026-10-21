import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '@/client/components/shell/coming_soon';
import { featureBySegment } from '@/client/components/shell/nav_model';

// Every planned feature in the sidebar lands here until it ships. Anything
// else under /w/{slug}/ is a real 404.
export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params;
  return { title: featureBySegment(feature)?.label ?? 'Not found' };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ workspace_slug: string; feature: string }>;
}) {
  const { workspace_slug, feature } = await params;
  const meta = featureBySegment(feature);
  if (!meta || meta.id === 'settings') notFound();
  return <ComingSoon title={meta.label} blurb={meta.blurb} workspaceSlug={workspace_slug} />;
}
