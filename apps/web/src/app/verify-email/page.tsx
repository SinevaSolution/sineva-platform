import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { VerifyEmailStatus } from '@/client/components/auth/verify_email_status';

export const metadata: Metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard
      scene="thumbs"
      title="Verify your email"
      pose="wave"
      footer={<AuthLink href="/sign-in">Back to sign in</AuthLink>}
    >
      <VerifyEmailStatus token={token ?? null} />
    </AuthCard>
  );
}
