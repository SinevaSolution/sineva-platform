import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { ForgotPasswordForm } from '@/client/components/auth/password_reset_forms';
import { getTranslations } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('forgot_password') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <AuthCard
      scene="mail"
      title={t('forgot_password.title')}
      subtitle={t('forgot_password.subtitle')}
      pose="holding-phone"
      footer={t.rich('forgot_password.footer', {
        link: <AuthLink href="/sign-in">{t('forgot_password.footer_link')}</AuthLink>,
      })}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
