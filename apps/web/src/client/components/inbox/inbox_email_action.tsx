'use client';
import { SNCard } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';

/** Plain text only: no email HTML, remote images or active links. */
export function InboxEmailAction({ payload }: { payload: Record<string, unknown> }) {
  const t = useTranslations('inbox_ui.email_action');
  const request =
    payload.request && typeof payload.request === 'object'
      ? (payload.request as Record<string, unknown>)
      : {};
  const args =
    request.arguments && typeof request.arguments === 'object'
      ? (request.arguments as Record<string, unknown>)
      : {};
  const labels = { to: t('to'), cc: t('cc'), subject: t('subject'), query: t('query') };
  const fields: Array<[string, string]> = [];
  if (typeof payload.account_label === 'string') fields.push([t('account'), payload.account_label]);
  for (const key of ['to', 'cc'] as const) {
    const value = args[key];
    if (Array.isArray(value))
      fields.push([
        labels[key],
        value.filter((v): v is string => typeof v === 'string').join(', '),
      ]);
  }
  for (const key of ['subject', 'query'] as const)
    if (typeof args[key] === 'string') fields.push([labels[key], args[key]]);
  return (
    <SNCard className="space-y-4">
      <h3 className="text-sm font-semibold text-text">{t('title')}</h3>
      <dl className="space-y-2">
        {fields.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <dt className="text-xs text-text-tertiary">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm text-text">{value}</dd>
          </div>
        ))}
      </dl>
      {typeof args.body_text === 'string' ? (
        <div className="space-y-2">
          <p className="text-xs text-text-tertiary">{t('body')}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">
            {args.body_text}
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{t('read_note')}</p>
      )}
    </SNCard>
  );
}
