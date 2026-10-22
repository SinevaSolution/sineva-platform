import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { ResetPasswordForm } from '@/client/components/auth/password_reset_forms';
import { getTranslations } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('reset_password') };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getTranslations('auth');
  return (
    <AuthCard
      scene="build"
      title={t('reset_password.title')}
      subtitle={t('reset_password.subtitle')}
      pose="laptop"
      footer={<AuthLink href="/forgot-password">{t('reset_password.footer_link')}</AuthLink>}
    >
      <ResetPasswordForm token={token ?? null} />
    </AuthCard>
  );
}
