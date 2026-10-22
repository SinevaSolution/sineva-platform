import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SNButton } from '@sineva/ui';
import {
  getGetInboxCountsUseCase,
  getGetInboxItemUseCase,
  getListInboxUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { getTranslations } from '@/i18n/server';
import { InboxDetail } from '@/client/components/inbox/inbox_detail';
import { loadWorkspaceContext } from '../workspace_context';
import type { InboxTabView } from '@/shared/inbox_view';
const tabs = {
  needs_review: 'views.needs_review',
  needs_input: 'views.needs_input',
  done: 'views.done',
} as const;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ tab?: string; item?: string; cursor?: string; agent_slug?: string }>;
}) {
  const { workspace_slug } = await params;
  const query = await searchParams;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const counts = await getGetInboxCountsUseCase().execute(context);
  const tab: InboxTabView =
    query.tab && Object.hasOwn(tabs, query.tab)
      ? (query.tab as InboxTabView)
      : context.role === 'viewer'
        ? 'done'
        : counts.needs_review > 0
          ? 'needs_review'
          : counts.needs_input > 0
            ? 'needs_input'
            : 'done';
  const list = await getListInboxUseCase().execute(
    { tab, limit: 20, cursor: query.cursor?.slice(0, 300), agent_slug: query.agent_slug },
    context,
  );
  const t = await getTranslations('inbox_ui');
  const item = query.item
    ? await getGetInboxItemUseCase()
        .execute(query.item, context)
        .catch((error: unknown) => {
          if (error instanceof DomainError && error.status === 404) notFound();
          throw error;
        })
    : null;
  const href = (values: Record<string, string>) =>
    `/w/${workspace_slug}/inbox?${new URLSearchParams({ tab, ...(query.agent_slug ? { agent_slug: query.agent_slug } : {}), ...values })}`;
  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 p-5 sm:p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <nav aria-label={t('tabs')} className="flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key, label]) => (
          <SNButton asChild key={key} variant={tab === key ? 'primary' : 'secondary'}>
            <Link href={href({ tab: key })} aria-current={tab === key ? 'page' : undefined}>
              {t(label)} ({counts[key as InboxTabView]})
            </Link>
          </SNButton>
        ))}
      </nav>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className={item ? 'hidden lg:block' : undefined}>
          {list.items.length === 0 ? (
            <p className="rounded-md border border-border p-6 text-sm text-text-secondary">
              {t('empty')}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {list.items.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={href({ item: entry.id })}
                    className="block space-y-1 rounded-sm p-4 focus-visible:outline-2 focus-visible:outline-action-primary"
                    aria-current={item?.id === entry.id ? 'page' : undefined}
                  >
                    <span className="block font-medium">{entry.title}</span>
                    {entry.unread ? (
                      <span className="text-xs text-text-secondary">{t('unread')}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {list.next_cursor ? (
            <SNButton asChild>
              <Link href={href({ cursor: list.next_cursor })}>{t('next')}</Link>
            </SNButton>
          ) : null}
        </div>
        {item ? (
          <div className="space-y-3">
            <SNButton asChild>
              <Link href={href({})}>{t('back_to_list')}</Link>
            </SNButton>
            <InboxDetail
              key={`${item.id}-${item.approval?.version ?? item.input_request?.version ?? item.state}`}
              item={item}
              workspaceId={ctx.workspace.id}
              workspaceSlug={workspace_slug}
              readOnly={context.role === 'viewer'}
            />
          </div>
        ) : (
          <p className="p-5 text-sm text-text-secondary">{t('select_item')}</p>
        )}
      </div>
    </section>
  );
}
