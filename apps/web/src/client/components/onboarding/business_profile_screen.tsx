'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  SNBanner,
  SNButton,
  SNConfirmDialog,
  SNDialog,
  SNField,
  SNInput,
  SNSelect,
  SNTextarea,
  snToast,
} from '@sineva/ui';
import { formatDate, formatIdr } from '@sineva/ui/format';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  BusinessProfileResultView,
  OfferingEntity,
  PolicyEntity,
  ProfileVersionEntity,
} from '@/shared/business_profile_view';
import type { ProfileScanEntity } from '@/shared/scan_view';
const fields = {
  display_name: 'fields.display_name',
  legal_name: 'fields.legal_name',
  industry: 'fields.industry',
  city: 'fields.city',
  province: 'fields.province',
  website_url: 'fields.website_url',
  audience: 'fields.audience',
} as const;
const policyKinds = {
  returns: 'kinds.returns',
  shipping: 'kinds.shipping',
  payment: 'kinds.payment',
  hours: 'kinds.hours',
  faq: 'kinds.faq',
  other: 'kinds.other',
} as const;
const formalityKeys = {
  formal: 'tones.formal',
  neutral: 'tones.neutral',
  casual: 'tones.casual',
} as const;
const emojiKeys = {
  never: 'emoji_options.never',
  sometimes: 'emoji_options.sometimes',
  often: 'emoji_options.often',
} as const;
type Entry =
  | { kind: 'offering'; value: OfferingEntity | null }
  | { kind: 'policy'; value: PolicyEntity | null };
export function BusinessProfileScreen({
  workspaceId,
  workspaceSlug,
  result,
  versions,
  canEdit,
}: {
  workspaceId: string;
  workspaceSlug: string;
  result: BusinessProfileResultView;
  versions: Array<Omit<ProfileVersionEntity, 'snapshot'>>;
  canEdit: boolean;
}) {
  const t = useTranslations('business_ui');
  const locale = useLocale();
  const errorText = useApiErrorText();
  const router = useRouter();
  const base = `/api/v1/workspaces/${workspaceId}/profile`;
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState(false);
  const [scan, setScan] = React.useState<ProfileScanEntity | null>(null);
  const [values, setValues] = React.useState(() =>
    Object.fromEntries(
      Object.keys(fields).map((key) => [
        key,
        String(result.profile[key as keyof typeof fields] ?? ''),
      ]),
    ),
  );
  const [websiteSources, setWebsiteSources] = React.useState<string[]>([]);
  const [formality, setFormality] = React.useState(
    result.profile.brand_voice?.formality ?? 'neutral',
  );
  const [emoji, setEmoji] = React.useState(result.profile.brand_voice?.emoji_use ?? 'sometimes');
  const [entry, setEntry] = React.useState<Entry | null>(null);
  const [confirm, setConfirm] = React.useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  const [history, setHistory] = React.useState<ProfileVersionEntity | null>(null);
  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const body = {
        ...Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, value.trim() || null]),
        ),
        base_version: result.profile.version,
        brand_voice: {
          ...result.profile.brand_voice,
          formality,
          emoji_use: emoji,
          samples: String(form.get('samples') ?? '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        ...(websiteSources.length && scan
          ? {
              scan_id: scan.id,
              field_sources: Object.fromEntries(
                websiteSources.filter((key) => values[key]?.trim()).map((key) => [key, 'website']),
              ),
            }
          : {}),
      };
      const saved = await apiRequest<{ warnings: unknown[] }>(base, { method: 'PUT', body });
      setWarning(saved.warnings.length > 0);
      if (saved.warnings.length > 0) snToast.warning(t('content_warning'));
      setWebsiteSources([]);
    });
  }
  async function requestScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const response = await apiRequest<{ scan: ProfileScanEntity }>(`${base}/scans`, {
        method: 'POST',
        body: { source_url: form.get('source_url'), locale: locale === 'id' ? 'id' : 'en' },
      });
      setScan(response.scan);
    });
  }
  const suggest = (key: string, value: string) => {
    setValues({ ...values, [key]: value });
    setWebsiteSources((current) => [...new Set([...current, key])]);
  };
  return (
    <section className="mx-auto w-full max-w-3xl space-y-8 p-5 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-text-secondary">{t('description')}</p>
        <SNButton asChild size="sm">
          <Link href={`/w/${workspaceSlug}/onboarding`}>{t('setup')}</Link>
        </SNButton>
      </header>
      {error && !entry && !confirm && !history ? <SNBanner tone="danger">{error}</SNBanner> : null}
      {warning ? <SNBanner tone="warning">{t('content_warning')}</SNBanner> : null}
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={!canEdit || pending} className="grid gap-4 sm:grid-cols-2">
          {Object.entries(fields).map(([key, label]) => (
            <SNField key={key} label={t(label)}>
              {key === 'audience' ? (
                <SNTextarea
                  value={values[key]}
                  onChange={(e) => {
                    setValues({ ...values, [key]: e.target.value });
                    setWebsiteSources((current) => current.filter((value) => value !== key));
                  }}
                  maxLength={500}
                  rows={3}
                />
              ) : (
                <SNInput
                  type={key === 'website_url' ? 'url' : 'text'}
                  value={values[key]}
                  maxLength={
                    key === 'website_url'
                      ? 2048
                      : key === 'legal_name'
                        ? 150
                        : ['industry', 'city', 'province'].includes(key)
                          ? 80
                          : 100
                  }
                  onChange={(e) => {
                    setValues({ ...values, [key]: e.target.value });
                    setWebsiteSources((current) => current.filter((value) => value !== key));
                  }}
                />
              )}
            </SNField>
          ))}
          <SNField label={t('formality')}>
            <SNSelect
              value={formality}
              onValueChange={(value) => setFormality(value as typeof formality)}
              options={Object.entries(formalityKeys).map(([value, key]) => ({
                value,
                label: t(key),
              }))}
            />
          </SNField>
          <SNField label={t('emoji')}>
            <SNSelect
              value={emoji}
              onValueChange={(value) => setEmoji(value as typeof emoji)}
              options={Object.entries(emojiKeys).map(([value, key]) => ({ value, label: t(key) }))}
            />
          </SNField>
          <SNField label={t('samples')} hint={t('samples_hint')}>
            <SNTextarea
              name="samples"
              rows={4}
              defaultValue={result.profile.brand_voice?.samples?.join('\n') ?? ''}
              maxLength={1502}
            />
          </SNField>
        </fieldset>
        {canEdit ? (
          <SNButton type="submit" variant="primary" loading={pending}>
            {t('save')}
          </SNButton>
        ) : (
          <p className="text-sm text-text-secondary">{t('read_only')}</p>
        )}
      </form>
      {canEdit ? (
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">{t('scan_title')}</h2>
          <p className="text-sm text-text-secondary">{t('scan_hint')}</p>
          <form onSubmit={requestScan} className="space-y-3">
            <SNField label={t('website_url')} required>
              <SNInput
                name="source_url"
                type="url"
                required
                maxLength={2048}
                defaultValue={result.profile.website_url ?? ''}
              />
            </SNField>
            <SNButton type="submit" loading={pending}>
              {t('scan')}
            </SNButton>
          </form>
          {scan ? (
            <div className="space-y-4 rounded-md border border-border p-4">
              {scan.status === 'failed' ? (
                <SNBanner tone="warning">{t('scan_failed')}</SNBanner>
              ) : (
                <>
                  <SNBanner>{t('scan_review')}</SNBanner>
                  {scan.result?.fields.display_name ? (
                    <div>
                      <p className="font-medium">{scan.result.fields.display_name.value}</p>
                      <p className="my-2 text-sm text-text-secondary">
                        {scan.result.fields.display_name.evidence_snippet}
                      </p>
                      <SNButton
                        size="sm"
                        onClick={() =>
                          suggest('display_name', scan.result!.fields.display_name!.value)
                        }
                      >
                        {t('use_name')}
                      </SNButton>
                    </div>
                  ) : null}
                  {scan.result?.fields.description ? (
                    <div>
                      <p className="text-sm">{scan.result.fields.description.value}</p>
                      <p className="my-2 text-sm text-text-secondary">
                        {scan.result.fields.description.evidence_snippet}
                      </p>
                    </div>
                  ) : null}
                  <p className="break-all text-xs text-text-secondary">{scan.url}</p>
                </>
              )}
              <SNButton
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await apiRequest(`${base}/scans/${scan.id}`, { method: 'DELETE' });
                    setScan(null);
                    setWebsiteSources([]);
                  })
                }
              >
                {t('discard_scan')}
              </SNButton>
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('offerings')}</h2>
          {canEdit ? (
            <SNButton
              onClick={() => {
                setError(null);
                setEntry({ kind: 'offering', value: null });
              }}
            >
              {t('add_offering')}
            </SNButton>
          ) : null}
        </div>
        {result.offerings.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('empty_offerings')}</p>
        ) : (
          <ul className="space-y-3">
            {result.offerings.map((offer) => (
              <li key={offer.id} className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-medium">{offer.name}</h3>
                <p className="whitespace-pre-wrap text-sm">{offer.description}</p>
                {offer.price_amount !== null ? (
                  <p className="text-sm">{formatIdr(offer.price_amount, locale)}</p>
                ) : null}
                {!offer.confirmed_at ? (
                  <SNBanner tone="warning">{t('unconfirmed')}</SNBanner>
                ) : null}
                {canEdit ? (
                  <div className="flex gap-2">
                    <SNButton
                      size="sm"
                      onClick={() => setEntry({ kind: 'offering', value: offer })}
                    >
                      {t('edit')}
                    </SNButton>
                    <SNButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirm({
                          title: t('delete_title'),
                          description: offer.name,
                          action: async () => {
                            await apiRequest(`${base}/offerings/${offer.id}`, { method: 'DELETE' });
                            setConfirm(null);
                          },
                        })
                      }
                    >
                      {t('delete')}
                    </SNButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('policies')}</h2>
          {canEdit ? (
            <SNButton
              onClick={() => {
                setError(null);
                setEntry({ kind: 'policy', value: null });
              }}
            >
              {t('add_policy')}
            </SNButton>
          ) : null}
        </div>
        {result.policies.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('empty_policies')}</p>
        ) : (
          <ul className="space-y-3">
            {result.policies.map((policy) => (
              <li key={policy.id} className="space-y-2 rounded-md border border-border p-4">
                <h3 className="font-medium">{policy.title}</h3>
                <p className="whitespace-pre-wrap text-sm">{policy.body}</p>
                {!policy.confirmed_at ? (
                  <SNBanner tone="warning">{t('unconfirmed')}</SNBanner>
                ) : null}
                {canEdit ? (
                  <div className="flex gap-2">
                    <SNButton size="sm" onClick={() => setEntry({ kind: 'policy', value: policy })}>
                      {t('edit')}
                    </SNButton>
                    <SNButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirm({
                          title: t('delete_title'),
                          description: policy.title,
                          action: async () => {
                            await apiRequest(`${base}/policies/${policy.id}`, { method: 'DELETE' });
                            setConfirm(null);
                          },
                        })
                      }
                    >
                      {t('delete')}
                    </SNButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {canEdit ? (
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">{t('history')}</h2>
          <ul className="space-y-3">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <p className="text-sm">
                  {t('version', { number: version.version })} ·{' '}
                  {formatDate(version.created_at, locale)}
                </p>
                <SNButton
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const response = await apiRequest<{ version: ProfileVersionEntity }>(
                        `${base}/versions/${version.version}`,
                      );
                      setHistory(response.version);
                    })
                  }
                >
                  {t('review_version')}
                </SNButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {entry ? (
        <ProfileEntryEditor
          key={`${entry.kind}-${entry.value?.id ?? 'new'}`}
          entry={entry}
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setEntry(null);
          }}
          onSave={(body) =>
            run(async () => {
              const path = entry.kind === 'offering' ? 'offerings' : 'policies';
              const saved = await apiRequest<{ warnings?: unknown[] }>(
                `${base}/${path}${entry.value ? `/${entry.value.id}` : ''}`,
                { method: entry.value ? 'PATCH' : 'POST', body },
              );
              setWarning((saved.warnings?.length ?? 0) > 0);
              if ((saved.warnings?.length ?? 0) > 0) snToast.warning(t('content_warning'));
              setEntry(null);
            })
          }
        />
      ) : null}
      <SNDialog
        open={history !== null}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
        title={t('review_version')}
        closeLabel={t('close')}
      >
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {history ? (
            <>
              <p className="text-sm">{t('version', { number: history.version })}</p>
              <dl className="space-y-2 text-sm">
                {Object.entries(fields).map(([key, label]) => (
                  <div key={key}>
                    <dt className="font-medium">{t(label)}</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {String(history.snapshot.fields[key as keyof typeof fields] ?? '')}
                    </dd>
                  </div>
                ))}
              </dl>
              {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
              <SNButton
                variant="primary"
                onClick={() => {
                  const version = history.version;
                  setHistory(null);
                  setConfirm({
                    title: t('restore_title'),
                    description: t('restore_body'),
                    action: async () => {
                      await apiRequest(`${base}/versions/${version}/restore`, { method: 'POST' });
                      setConfirm(null);
                    },
                  });
                }}
              >
                {t('restore')}
              </SNButton>
            </>
          ) : null}
        </div>
      </SNDialog>
      <SNConfirmDialog
        error={error}
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(null);
        }}
        title={confirm?.title ?? t('delete_title')}
        description={confirm?.description ?? ''}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => {
          if (confirm) void run(confirm.action);
        }}
      />
      {error && confirm ? <SNBanner tone="danger">{error}</SNBanner> : null}
    </section>
  );
}
function ProfileEntryEditor({
  entry,
  pending,
  error,
  onSave,
  onClose,
}: {
  entry: Entry;
  pending: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const t = useTranslations('business_ui');
  const offer = entry.kind === 'offering' ? entry.value : null;
  const policy = entry.kind === 'policy' ? entry.value : null;
  const [kind, setKind] = React.useState(policy?.kind ?? 'other');
  return (
    <SNDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={entry.kind === 'offering' ? t('add_offering') : t('add_policy')}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          onSave(
            entry.kind === 'offering'
              ? {
                  name: form.get('name'),
                  description: String(form.get('body') ?? '').trim() || null,
                  price_amount:
                    String(form.get('price') ?? '') === '' ? null : Number(form.get('price')),
                  url: String(form.get('url') ?? '').trim() || null,
                  confirmed: true,
                }
              : { kind, title: form.get('name'), body: form.get('body'), confirmed: true },
          );
        }}
      >
        <SNField label={t('entry_name')} required>
          <SNInput
            name="name"
            defaultValue={offer?.name ?? policy?.title ?? ''}
            required
            maxLength={120}
          />
        </SNField>
        {entry.kind === 'policy' ? (
          <SNField label={t('policy_kind')}>
            <SNSelect
              value={kind}
              onValueChange={(value) => setKind(value as typeof kind)}
              options={Object.entries(policyKinds).map(([value, key]) => ({
                value,
                label: t(key),
              }))}
            />
          </SNField>
        ) : null}
        <SNField label={t('entry_body')} required={entry.kind === 'policy'}>
          <SNTextarea
            name="body"
            defaultValue={offer?.description ?? policy?.body ?? ''}
            maxLength={entry.kind === 'policy' ? 2000 : 500}
            required={entry.kind === 'policy'}
            rows={5}
          />
        </SNField>
        {entry.kind === 'offering' ? (
          <>
            <SNField label={t('price')} hint={t('price_hint')}>
              <SNInput
                name="price"
                type="number"
                step={1}
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                defaultValue={offer?.price_amount ?? ''}
              />
            </SNField>
            <SNField label={t('offer_url')}>
              <SNInput name="url" type="url" defaultValue={offer?.url ?? ''} maxLength={2048} />
            </SNField>
          </>
        ) : null}
        <p className="text-sm text-text-secondary">{t('confirm_entry')}</p>
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        <div className="flex gap-2">
          <SNButton type="submit" variant="primary" loading={pending}>
            {t('save')}
          </SNButton>
          <SNButton disabled={pending} onClick={onClose}>
            {t('cancel')}
          </SNButton>
        </div>
      </form>
    </SNDialog>
  );
}
