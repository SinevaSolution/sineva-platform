import { notFound } from 'next/navigation';
import { AuthCard } from '@/client/components/auth/auth_card';
import { LinkAcceptance } from '@/client/components/members/link_acceptance';
import { getPreviewOwnershipTransferUseCase } from '@/server/container';
import { DomainError } from '@/server/domain/errors/domain_error';
import { getPageSession } from '@/server/http/page_session';
import { loadSignInMethods } from '@/server/http/sign_in_methods';
import { reauthMethodsOf } from '@/shared/sign_in_methods_view';
import { getTranslations } from '@/i18n/server';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ oauth?: string | string[] }>;
}) {
  const { token } = await params;
  const notice = (await searchParams).oauth;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) notFound();
  const session = await getPageSession();
  const t = await getTranslations('members');
  const preview = await getPreviewOwnershipTransferUseCase()
    .execute({ token, viewer_user_id: session?.user_id })
    .catch((error: unknown) => {
      if (error instanceof DomainError && error.status === 404) notFound();
      throw error;
    });
  return (
    <AuthCard scene="lineup" title={t('ownership_title')}>
      <LinkAcceptance
        kind="ownership"
        token={token}
        preview={preview}
        // Accepting ownership needs a fresh session, so the page must know how to re-confirm.
        reauthMethods={session ? reauthMethodsOf(await loadSignInMethods(session)) : undefined}
        initialNotice={typeof notice === 'string' ? notice : undefined}
      />
    </AuthCard>
  );
}
