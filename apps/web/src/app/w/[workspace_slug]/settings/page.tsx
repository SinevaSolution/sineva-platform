import type { Metadata } from 'next';
import Link from 'next/link';
import { ComingSoon } from '@/client/components/shell/coming_soon';
import { FEATURES } from '@/client/components/shell/nav_model';
import { buttonVariants } from '@/client/components/ui/button';
import { getTranslations } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell');
  return { title: t(FEATURES.settings.labelKey) };
}

export default async function SettingsPage({ params }: { params: Promise<{ workspace_slug: string }> }) {
  const { workspace_slug } = await params;
  const t = await getTranslations('shell');
  const tAccount = await getTranslations('account');
  return (
    <ComingSoon
      title={t(FEATURES.settings.labelKey)}
      blurb={t(FEATURES.settings.blurbKey)}
      workspaceSlug={workspace_slug}
    >
      <Link href={`/w/${workspace_slug}/settings/profile`} className={buttonVariants({ variant: 'secondary' })}>
        {tAccount('settings.edit_profile')}
      </Link>
    </ComingSoon>
  );
}
