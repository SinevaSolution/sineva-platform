import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { OAuthButtons, OrDivider } from '@/client/components/auth/oauth_buttons';
import { SignUpForm } from '@/client/components/auth/sign_up_form';
import { getTranslations } from '@/i18n/server';
import { getPageSession } from '@/server/http/page_session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('sign_up') };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo =
    next && /^\/(invite|ownership)\/[A-Za-z0-9_-]{16,128}$/.test(next) ? next : undefined;
  if (await getPageSession()) {
    redirect('/');
  }
  const t = await getTranslations('auth');
  return (
    <AuthCard
      scene="lineup"
      title={t('sign_up.title')}
      subtitle={t('sign_up.subtitle')}
      footer={t.rich('sign_up.footer', {
        link: (
          <AuthLink href={returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : '/sign-in'}>
            {t('sign_up.footer_link')}
          </AuthLink>
        ),
      })}
    >
      <OAuthButtons returnTo={returnTo} />
      <OrDivider />
      <SignUpForm returnTo={returnTo} />
    </AuthCard>
  );
}
