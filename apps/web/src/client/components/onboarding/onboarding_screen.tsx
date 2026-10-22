'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SNBanner, SNButton, SNCheckbox, SNField, SNInput, SNSelect } from '@sineva/ui';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { FirstTaskView, OnboardingStateEntity } from '@/shared/onboarding_view';
const businessTypes = {
  online_shop: 'types.online_shop',
  food_beverage: 'types.food_beverage',
  services_agency: 'types.services_agency',
  retail_store: 'types.retail_store',
  manufacturing: 'types.manufacturing',
  other: 'types.other',
} as const;
const goals = {
  faster_replies: 'goals.faster_replies',
  organize_finances: 'goals.organize_finances',
  create_content: 'goals.create_content',
  find_customers: 'goals.find_customers',
  manage_staff: 'goals.manage_staff',
  tax_admin: 'goals.tax_admin',
  understand_numbers: 'goals.understand_numbers',
} as const;
export function OnboardingScreen({
  workspaceId,
  workspaceSlug,
  state,
  tasks,
  step,
}: {
  workspaceId: string;
  workspaceSlug: string;
  state: OnboardingStateEntity;
  tasks: FirstTaskView[];
  step: number;
}) {
  const t = useTranslations('onboarding_ui');
  const errorText = useApiErrorText();
  const router = useRouter();
  const base = `/api/v1/workspaces/${workspaceId}/onboarding`;
  const total = state.flow === 'owner' ? 5 : 2;
  const [language, setLanguage] = React.useState(state.answers.language ?? 'id');
  const [businessType, setBusinessType] = React.useState(state.answers.business_type ?? 'other');
  const [selectedGoals, setSelectedGoals] = React.useState<string[]>(state.answers.goals ?? []);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const action =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'skip'
        ? 'skip'
        : 'save';
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (state.flow === 'owner' && step === 5) {
        await apiRequest(`${base}/complete`, { method: 'POST', body: {} });
        router.replace(`/w/${workspaceSlug}/onboarding`);
        router.refresh();
      } else {
        const answers =
          step === 1
            ? { language }
            : step === 2 && state.flow === 'owner'
              ? {
                  business_name: form.get('business_name'),
                  business_type: businessType,
                  city: String(form.get('city') ?? '').trim() || null,
                }
              : step === 3
                ? {
                    website_url: String(form.get('website') ?? '').trim() || null,
                    instagram_handle: String(form.get('instagram') ?? '').trim() || null,
                    marketplace_url: String(form.get('marketplace') ?? '').trim() || null,
                  }
                : step === 4
                  ? { goals: selectedGoals }
                  : {};
        const result = await apiRequest<{
          workspace: { workspace_slug: string };
          onboarding: OnboardingStateEntity;
        }>(base, {
          method: 'PATCH',
          body: { step, action, ...(action === 'save' ? { answers } : {}) },
        });
        if (step === 1)
          await apiRequest('/api/v1/me', { method: 'PATCH', body: { locale: language } });
        const next = result.workspace.workspace_slug;
        router.replace(
          `/w/${next}/onboarding${result.onboarding.status === 'completed' ? '' : `?step=${Math.min(step + 1, total)}`}`,
        );
        router.refresh();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }
  if (state.status === 'completed')
    return (
      <section className="mx-auto w-full max-w-2xl space-y-6 p-6 sm:p-10">
        <h1 className="text-2xl font-semibold">{t('complete_title')}</h1>
        <p className="text-text-secondary">{t('first_tasks')}</p>
        {tasks.length === 0 ? (
          <PresetEmptyState preset="onboarding_tasks" className="rounded-md border border-dashed border-border py-6" />
        ) : null}
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.task_id} className="space-y-3 rounded-md border border-border p-4">
              <h2 className="font-medium">{task.title}</h2>
              <p className="text-sm text-text-secondary">{task.message}</p>
              <div className="flex gap-2">
                <SNButton asChild variant="primary">
                  <Link
                    href={`/w/${workspaceSlug}/new?with=${encodeURIComponent(task.specialist_slug)}&prompt=${encodeURIComponent(task.message)}`}
                  >
                    {t('start_task')}
                  </Link>
                </SNButton>
                <SNButton
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await apiRequest(`${base}/first-tasks/${task.task_id}/dismiss`, {
                        method: 'POST',
                      });
                      router.refresh();
                    } catch (err) {
                      setError(errorText(err));
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {t('dismiss_task')}
                </SNButton>
              </div>
            </li>
          ))}
        </ul>
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        <SNButton asChild>
          <Link href={`/w/${workspaceSlug}`}>{t('go_home')}</Link>
        </SNButton>
      </section>
    );
  const title =
    step === 1
      ? t('language_title')
      : state.flow === 'member'
        ? t('welcome_title')
        : step === 2
          ? t('business_title')
          : step === 3
            ? t('channels_title')
            : step === 4
              ? t('goals_title')
              : t('review_title');
  return (
    <section className="mx-auto w-full max-w-xl space-y-6 p-6 sm:p-10">
      <p className="text-sm text-text-secondary">{t('step', { step, total })}</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <form onSubmit={submit} className="space-y-5">
        {step === 1 ? (
          <SNField label={t('language')} required>
            <SNSelect
              value={language}
              onValueChange={(value) => setLanguage(value as 'id' | 'en')}
              options={[
                { value: 'id', label: t('indonesian') },
                { value: 'en', label: t('english') },
              ]}
            />
          </SNField>
        ) : state.flow === 'member' ? (
          <p className="text-sm text-text-secondary">{t('welcome_body')}</p>
        ) : step === 2 ? (
          <>
            <SNField label={t('business_name')} required>
              <SNInput
                name="business_name"
                defaultValue={state.answers.business_name ?? ''}
                required
                maxLength={100}
              />
            </SNField>
            <SNField label={t('business_type')} required>
              <SNSelect
                value={businessType}
                onValueChange={(value) => setBusinessType(value as typeof businessType)}
                options={Object.entries(businessTypes).map(([value, key]) => ({
                  value,
                  label: t(key),
                }))}
              />
            </SNField>
            <SNField label={t('city')}>
              <SNInput name="city" defaultValue={state.answers.city ?? ''} maxLength={80} />
            </SNField>
          </>
        ) : step === 3 ? (
          <>
            <p className="text-sm text-text-secondary">{t('channels_hint')}</p>
            <SNField label={t('website')}>
              <SNInput
                name="website"
                type="url"
                defaultValue={state.answers.website_url ?? ''}
                maxLength={2048}
              />
            </SNField>
            <SNField label={t('instagram')}>
              <SNInput
                name="instagram"
                defaultValue={state.answers.instagram_handle ?? ''}
                maxLength={31}
              />
            </SNField>
            <SNField label={t('marketplace')}>
              <SNInput
                name="marketplace"
                type="url"
                defaultValue={state.answers.marketplace_url ?? ''}
                maxLength={2048}
              />
            </SNField>
          </>
        ) : step === 4 ? (
          <fieldset>
            <legend className="text-sm text-text-secondary">{t('goals_hint')}</legend>
            {Object.entries(goals).map(([value, key]) => (
              <SNCheckbox
                key={value}
                label={t(key)}
                checked={selectedGoals.includes(value)}
                disabled={!selectedGoals.includes(value) && selectedGoals.length >= 3}
                onCheckedChange={(checked) =>
                  setSelectedGoals(
                    checked
                      ? [...selectedGoals, value]
                      : selectedGoals.filter((goal) => goal !== value),
                  )
                }
              />
            ))}
          </fieldset>
        ) : (
          <>
            <SNBanner>{t('confirm_hint')}</SNBanner>
            <dl className="space-y-3 text-sm">
              <dt className="font-medium">{t('business_name')}</dt>
              <dd>{state.answers.business_name}</dd>
              <dt className="font-medium">{t('business_type')}</dt>
              <dd>
                {state.answers.business_type ? t(businessTypes[state.answers.business_type]) : ''}
              </dd>
              <dt className="font-medium">{t('website')}</dt>
              <dd className="break-all">{state.answers.website_url ?? t('not_set')}</dd>
            </dl>
            <SNButton asChild>
              <Link href={`/w/${workspaceSlug}/onboarding?step=2`}>{t('edit_details')}</Link>
            </SNButton>
          </>
        )}
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        <div className="flex flex-wrap gap-2">
          <SNButton type="submit" value="save" variant="primary" loading={pending}>
            {state.flow === 'owner' && step === 5
              ? t('confirm_profile')
              : state.flow === 'member' && step === 2
                ? t('finish')
                : t('continue')}
          </SNButton>
          {state.flow === 'owner' && step > 2 && step < 5 ? (
            <SNButton type="submit" value="skip" disabled={pending} formNoValidate>
              {t('skip')}
            </SNButton>
          ) : null}
          {step > 1 ? (
            <SNButton asChild disabled={pending}>
              <Link href={`/w/${workspaceSlug}/onboarding?step=${step - 1}`}>{t('back')}</Link>
            </SNButton>
          ) : null}
        </div>
      </form>
    </section>
  );
}
