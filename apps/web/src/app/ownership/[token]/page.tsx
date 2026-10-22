import { notFound } from 'next/navigation';
import { AuthCard } from '@/client/components/auth/auth_card';
import { LinkAcceptance } from '@/client/components/members/link_acceptance';
import { getPreviewOwnershipTransferUseCase } from '@/server/container';
import { DomainError } from '@/server/domain/errors/domain_error';
import { getPageSession } from '@/server/http/page_session';
import { getTranslations } from '@/i18n/server';
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
      <LinkAcceptance kind="ownership" token={token} preview={preview} />
    </AuthCard>
  );
}
