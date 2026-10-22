import type { Metadata } from 'next';
import Link from 'next/link';
import { FEATURES } from '@/client/components/shell/nav_model';
import { getTranslations } from '@/i18n/server';
import { SNButton } from '@sineva/ui';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell');
  return { title: t(FEATURES.settings.labelKey) };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await params;
  const t = await getTranslations('shell');
  const tAccount = await getTranslations('account');
  const tMembers = await getTranslations('members');
  const tBusiness = await getTranslations('business_ui');
  const tOnboarding = await getTranslations('onboarding_ui');
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 p-5 sm:p-8">
      <h1 className="text-2xl font-semibold">{t(FEATURES.settings.labelKey)}</h1>
      <div className="flex flex-wrap gap-3">
        <SNButton asChild variant="secondary" size="sm">
          <Link href={`/w/${workspace_slug}/settings/profile`}>
            {tAccount('settings.edit_profile')}
          </Link>
        </SNButton>
        <SNButton asChild variant="secondary" size="sm">
          <Link href={`/w/${workspace_slug}/settings/members`}>{tMembers('title')}</Link>
        </SNButton>
        <SNButton asChild variant="secondary" size="sm">
          <Link href={`/w/${workspace_slug}/settings/business`}>{tBusiness('title')}</Link>
        </SNButton>
        <SNButton asChild variant="secondary" size="sm">
          <Link href={`/w/${workspace_slug}/onboarding`}>{tOnboarding('resume')}</Link>
        </SNButton>
      </div>
    </section>
  );
}
