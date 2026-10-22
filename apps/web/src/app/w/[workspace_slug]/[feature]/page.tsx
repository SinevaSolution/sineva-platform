import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '@/client/components/shell/coming_soon';
import { featureBySegment } from '@/client/components/shell/nav_model';
import { getTranslations } from '@/i18n/server';

// Every planned feature in the sidebar lands here until it ships. Anything
// else under /w/{slug}/ is a real 404.
export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params;
  const t = await getTranslations('shell');
  const tMeta = await getTranslations('meta');
  const meta = featureBySegment(feature);
  return { title: meta ? t(meta.labelKey) : tMeta('not_found') };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ workspace_slug: string; feature: string }>;
}) {
  const { workspace_slug, feature } = await params;
  const t = await getTranslations('shell');
  const meta = featureBySegment(feature);
  if (!meta || meta.id === 'settings') notFound();
  return <ComingSoon title={t(meta.labelKey)} blurb={t(meta.blurbKey)} workspaceSlug={workspace_slug} />;
}
