import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { ResetPasswordForm } from '@/client/components/auth/password_reset_forms';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard
      scene="build"
      title="Set a new password"
      subtitle="Pick something you don't use anywhere else."
      pose="laptop"
      footer={<AuthLink href="/forgot-password">Request a new link</AuthLink>}
    >
      <ResetPasswordForm token={token ?? null} />
    </AuthCard>
  );
}
