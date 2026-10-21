import type { Metadata } from 'next';
import Link from 'next/link';
import { ComingSoon } from '@/client/components/shell/coming_soon';
import { FEATURES } from '@/client/components/shell/nav_model';
import { buttonVariants } from '@/client/components/ui/button';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: { params: Promise<{ workspace_slug: string }> }) {
  const { workspace_slug } = await params;
  return (
    <ComingSoon title="Settings" blurb={FEATURES.settings.blurb} workspaceSlug={workspace_slug}>
      <Link href={`/w/${workspace_slug}/settings/profile`} className={buttonVariants({ variant: 'secondary' })}>
        Edit your profile
      </Link>
    </ComingSoon>
  );
}
