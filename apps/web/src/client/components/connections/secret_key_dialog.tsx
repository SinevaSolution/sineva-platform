'use client';

import { Clock } from 'lucide-react';
import * as React from 'react';
import { SNBanner, SNButton, SNConfirmDialog, SNDialog, SNRadioGroup, snToast } from '@sineva/ui';
import type { ConnectionsApi } from '@/client/lib/connections_api';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  ConnectionOwnerScope,
  ConnectionView,
  CredentialFieldView,
  ProviderView,
} from '@/shared/connections_view';
import { secretErrorKind, type SecretErrorKind } from './connections_model';
import { ProviderLogoTile } from './provider_mark';
import { SecretField } from './secret_field';

/** Reminder cadence shown to the person. The server owns the actual schedule. */
const REMINDER_DAYS = 90;

function initialValues(fields: CredentialFieldView[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.field_key, f.kind === 'choice' ? (f.choices[0] ?? '') : '']));
}

/**
 * Paste a key, and Sineva tests it with the provider before anything is stored
 * (one call: a key that fails is never saved). The key exists only in this
 * component's state: not in Redux, the URL or browser storage, never prefilled,
 * cleared on cancel and right after save.
 */
export function SecretKeyDialog({
  open,
  onOpenChange,
  provider,
  api,
  replace = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderView;
  api: ConnectionsApi;
  /** Replacing the key of this connection (rotation, or reconnecting a key connection). */
  replace?: ConnectionView | null;
  onSaved: (connection: ConnectionView) => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const fields = provider.credential_fields;
  const ownerScope: ConnectionOwnerScope = replace
    ? replace.owner_scope
    : provider.can_connect_workspace
      ? 'workspace'
      : 'user';
  const [values, setValues] = React.useState(() => initialValues(fields));
  const [saving, setSaving] = React.useState(false);
  const [failure, setFailure] = React.useState<SecretErrorKind | null>(null);
  const [blank, setBlank] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const secretFields = fields.filter((f) => f.kind === 'secret');
  const typed = secretFields.some((f) => (values[f.field_key] ?? '') !== '');
  const label = (f: CredentialFieldView) => (locale === 'id' ? f.label_id : f.label_en);

  function close() {
    // Drop what was typed before the dialog goes away.
    setValues(initialValues(fields));
    setFailure(null);
    setBlank(false);
    setSaving(false);
    setConfirmDiscard(false);
    onOpenChange(false);
  }

  // Closing with typed text asks once; an empty form closes straight away.
  function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (typed && !saving) setConfirmDiscard(true);
    else close();
  }

  async function save() {
    if (saving) return;
    if (secretFields.some((f) => (values[f.field_key] ?? '') === '')) {
      setBlank(true);
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const connection = await api.saveSecret({
        provider: provider.slug,
        secret: values,
        owner_scope: ownerScope,
        connection_id: replace?.id ?? null,
      });
      onSaved(connection);
      snToast.success(t('toast.connected', { app: provider.name }));
      close();
    } catch (error) {
      setFailure(secretErrorKind(error));
      setSaving(false);
    }
  }

  const firstSecret = secretFields[0];
  const banner = failure && failure !== 'rejected' ? failure : null;

  return (
    <>
      <SNDialog
        open={open}
        onOpenChange={requestClose}
        title={replace ? t('form.replace_title', { app: provider.name }) : t('form.title', { app: provider.name })}
        closeLabel={t('common.close')}
        footer={
          <>
            <SNButton variant="ghost" onClick={() => requestClose(false)}>
              {t('common.cancel')}
            </SNButton>
            <SNButton variant="primary" loading={saving} onClick={() => void save()}>
              {saving ? t('form.saving') : t('form.save')}
            </SNButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ProviderLogoTile slug={provider.slug} name={provider.name} decorative />
            <p className="text-sm text-text-secondary">{t('form.intro')}</p>
          </div>

          {provider.read_only_notice ? <SNBanner tone="info">{t('form.read_only_note')}</SNBanner> : null}
          {banner ? (
            <SNBanner tone={banner === 'rate_limited' || banner === 'unreachable' ? 'warning' : 'danger'}>
              {banner === 'unreachable'
                ? t('form.error_unreachable', { app: provider.name })
                : banner === 'duplicate'
                  ? t('form.error_duplicate')
                  : banner === 'rate_limited'
                    ? t('form.error_rate_limited')
                    : t('form.error_generic')}
            </SNBanner>
          ) : null}

          {fields.map((field) =>
            field.kind === 'secret' ? (
              <SecretField
                key={field.field_key}
                label={label(field)}
                value={values[field.field_key] ?? ''}
                hint={field === firstSecret ? t('form.advice') : undefined}
                error={
                  field === firstSecret && failure === 'rejected'
                    ? t('form.error_rejected', { app: provider.name })
                    : blank && (values[field.field_key] ?? '') === ''
                      ? t('form.error_blank')
                      : null
                }
                disabled={saving}
                autoFocus={field === firstSecret}
                onChange={(next) => {
                  setValues((prev) => ({ ...prev, [field.field_key]: next }));
                  setFailure(null);
                  setBlank(false);
                }}
              />
            ) : (
              <SNRadioGroup
                key={field.field_key}
                name={`credential_${field.field_key}`}
                variant="cards"
                orientation="horizontal"
                aria-label={label(field)}
                value={values[field.field_key] ?? ''}
                onValueChange={(next) => {
                  setValues((prev) => ({ ...prev, [field.field_key]: next }));
                  setFailure(null);
                }}
                options={field.choices.map((choice) => ({
                  value: choice,
                  label:
                    choice === 'production'
                      ? t('form.production')
                      : choice === 'sandbox'
                        ? t('form.sandbox')
                        : choice,
                }))}
              />
            ),
          )}

          <p className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
            <Clock aria-hidden="true" className="size-4" />
            {t('form.reminder', { days: REMINDER_DAYS })}
          </p>
        </div>
      </SNDialog>

      <SNConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('form.discard_title')}
        description={t('form.discard_body')}
        confirmLabel={t('form.discard_confirm')}
        cancelLabel={t('form.discard_keep')}
        destructive
        onConfirm={close}
      />
    </>
  );
}
