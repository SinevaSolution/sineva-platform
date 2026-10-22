import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { VerifyEmailStatus } from '@/client/components/auth/verify_email_status';
import { getTranslations } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('verify_email') };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  const returnTo =
    next && /^\/(invite|ownership)\/[A-Za-z0-9_-]{16,128}$/.test(next) ? next : undefined;
  const t = await getTranslations('auth');
  return (
    <AuthCard
      scene="thumbs"
      title={t('verify_email.title')}
      pose="wave"
      footer={
        <AuthLink href={returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : '/sign-in'}>
          {t('verify_email.footer_link')}
        </AuthLink>
      }
    >
      <VerifyEmailStatus token={token ?? null} returnTo={returnTo} />
    </AuthCard>
  );
}
