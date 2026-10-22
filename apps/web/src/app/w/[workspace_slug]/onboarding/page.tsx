import { OnboardingScreen } from '@/client/components/onboarding/onboarding_screen';
import { getGetFirstTasksUseCase, getGetOnboardingUseCase } from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { getLocale } from '@/i18n/server';
import { loadWorkspaceContext } from '../workspace_context';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { workspace_slug } = await params;
  const query = await searchParams;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const result = await getGetOnboardingUseCase().execute({
    workspace_id: ctx.workspace.id,
    user_id: context.user_id,
    role: context.role!,
  });
  const locale = await getLocale();
  const tasks =
    result.state.status === 'completed'
      ? await getGetFirstTasksUseCase().execute({
          workspace_id: ctx.workspace.id,
          user_id: context.user_id,
          locale: locale === 'en' ? 'en' : 'id',
        })
      : [];
  const requestedStep = Number(query.step);
  const step =
    Number.isInteger(requestedStep) &&
    requestedStep >= 1 &&
    requestedStep <= result.state.current_step
      ? requestedStep
      : result.state.current_step;
  return (
    <OnboardingScreen
      key={`${ctx.workspace.id}-${step}-${result.state.status}`}
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      state={result.state}
      step={step}
      tasks={tasks}
    />
  );
}
