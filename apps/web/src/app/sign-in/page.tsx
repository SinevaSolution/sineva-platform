import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, AuthLink } from '@/client/components/auth/auth_card';
import { oauthErrorMessage } from '@/client/components/auth/auth_messages';
import { OAuthButtons, OrDivider } from '@/client/components/auth/oauth_buttons';
import { SignInForm } from '@/client/components/auth/sign_in_form';
import { sanitizeNextRedirect } from '@/proxy';
import { getPageSession } from '@/server/http/page_session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (await getPageSession()) {
    redirect('/');
  }
  const { error, next } = await searchParams;
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to pick up where you left off with Sino."
      footer={
        <>
          New to Sineva? <AuthLink href="/sign-up">Create an account</AuthLink>
        </>
      }
    >
      <OAuthButtons />
      <OrDivider />
      <SignInForm initialError={oauthErrorMessage(error)} redirectTo={sanitizeNextRedirect(next)} />
    </AuthCard>
  );
}
