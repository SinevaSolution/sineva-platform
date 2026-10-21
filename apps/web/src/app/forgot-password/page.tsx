import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { ForgotPasswordForm } from '@/client/components/auth/password_reset_forms';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      scene="mail"
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to set a new one."
      pose="holding-phone"
      footer={
        <>
          Remembered it? <AuthLink href="/sign-in">Back to sign in</AuthLink>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
