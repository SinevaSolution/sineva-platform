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

export default async function SignUpPage() {
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
        link: <AuthLink href="/sign-in">{t('sign_up.footer_link')}</AuthLink>,
      })}
    >
      <OAuthButtons />
      <OrDivider />
      <SignUpForm />
    </AuthCard>
  );
}
