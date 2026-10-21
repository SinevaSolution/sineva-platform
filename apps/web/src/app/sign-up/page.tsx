import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { OAuthButtons, OrDivider } from '@/client/components/auth/oauth_buttons';
import { SignUpForm } from '@/client/components/auth/sign_up_form';
import { getPageSession } from '@/server/http/page_session';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  if (await getPageSession()) {
    redirect('/');
  }
  return (
    <AuthCard
      scene="lineup"
      title="Meet Sino"
      subtitle="Create your account. Sino and the specialists are ready when you are."
      footer={
        <>
          Already have an account? <AuthLink href="/sign-in">Sign in</AuthLink>
        </>
      }
    >
      <OAuthButtons />
      <OrDivider />
      <SignUpForm />
    </AuthCard>
  );
}
