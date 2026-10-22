import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { VerifyEmailStatus } from '@/client/components/auth/verify_email_status';
import { getTranslations } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('verify_email') };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getTranslations('auth');
  return (
    <AuthCard
      scene="thumbs"
      title={t('verify_email.title')}
      pose="wave"
      footer={<AuthLink href="/sign-in">{t('verify_email.footer_link')}</AuthLink>}
    >
      <VerifyEmailStatus token={token ?? null} />
    </AuthCard>
  );
}
