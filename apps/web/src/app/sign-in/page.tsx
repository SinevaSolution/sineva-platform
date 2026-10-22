import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { oauthErrorKey } from '@/client/components/auth/auth_messages';
import { OAuthButtons, OrDivider } from '@/client/components/auth/oauth_buttons';
import { SignInForm } from '@/client/components/auth/sign_in_form';
import { getTranslations } from '@/i18n/server';
import { sanitizeNextRedirect } from '@/proxy';
import { getPageSession } from '@/server/http/page_session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('sign_in') };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await getPageSession()) {
    redirect('/');
  }
  const { error, next } = await searchParams;
  const returnTo =
    next && /^\/(invite|ownership)\/[A-Za-z0-9_-]{16,128}$/.test(next) ? next : undefined;
  const t = await getTranslations('auth');
  const errorKey = oauthErrorKey(error);
  return (
    <AuthCard
      title={t('sign_in.title')}
      subtitle={t('sign_in.subtitle')}
      footer={t.rich('sign_in.footer', {
        link: (
          <AuthLink href={returnTo ? `/sign-up?next=${encodeURIComponent(returnTo)}` : '/sign-up'}>
            {t('sign_in.footer_link')}
          </AuthLink>
        ),
      })}
    >
      <OAuthButtons returnTo={returnTo} />
      <OrDivider />
      <SignInForm
        initialError={errorKey ? t(errorKey) : null}
        redirectTo={sanitizeNextRedirect(next)}
      />
    </AuthCard>
  );
}
