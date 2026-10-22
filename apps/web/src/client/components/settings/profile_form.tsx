'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { Field, FormAlert } from '@/client/components/ui/field';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import { LOCALE_COOKIE } from '@sineva/i18n';
import type { ProfileView } from '@/shared/profile_view';
import {
  buildProfilePatch,
  FULL_NAME_MAX,
  isDraftSavable,
  LOCALE_OPTIONS,
  timeZoneOptions,
  type ProfileDraft,
} from './profile_form_model';

const SIGN_IN_PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
] as const;

function toDraft(profile: ProfileView): ProfileDraft {
  return { full_name: profile.full_name, locale: profile.locale, timezone: profile.timezone };
}

function Badge({ tone, children }: { tone: 'positive' | 'neutral'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
        tone === 'positive' ? 'bg-surface-tint text-text-brand' : 'bg-canvas-alt text-text-secondary',
      )}
    >
      {children}
    </span>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-text outline-none transition-colors focus:border-focus"
      >
        {children}
      </select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

export function ProfileForm({
  profile,
  timeZones,
  linkedProviders,
}: {
  profile: ProfileView;
  /** Resolved on the server so the option list is identical during hydration. */
  timeZones: string[];
  linkedProviders: string[];
}) {
  const router = useRouter();
  const t = useTranslations('account');
  const errorText = useApiErrorText();
  const [saved, setSaved] = React.useState<ProfileDraft>(() => toDraft(profile));
  const [draft, setDraft] = React.useState<ProfileDraft>(saved);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const zones = React.useMemo(
    () => timeZoneOptions(saved.timezone, timeZones),
    [saved.timezone, timeZones],
  );
  const canSave = !pending && isDraftSavable(saved, draft);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    setPending(true);
    setError(null);
    try {
      const updated = await apiRequest<ProfileView>('/api/v1/me/profile', {
        method: 'PATCH',
        body: buildProfilePatch(saved, draft),
      });
      const next = toDraft(updated);
      setSaved(next);
      setDraft(next);
      // Signed-out pages (sign-in after a sign-out) read the language from
      // this cookie, since the profile is only known while signed in.
      document.cookie = `${LOCALE_COOKIE}=${updated.locale}; path=/; max-age=31536000; samesite=lax`;
      toast.success(t('profile.saved'));
      // The shell reads the name from the session on the server.
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <Section title={t('profile.section_details')}>
        <Field
          label={t('profile.full_name')}
          name="full_name"
          autoComplete="name"
          maxLength={FULL_NAME_MAX}
          value={draft.full_name}
          onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
        />
        <Field
          label={t('profile.email')}
          name="email"
          type="email"
          value={profile.email}
          readOnly
          trailing={
            profile.email_verified ? (
              <Badge tone="positive">{t('profile.verified')}</Badge>
            ) : (
              <Badge tone="neutral">{t('profile.not_verified')}</Badge>
            )
          }
          className="[&_input]:cursor-default [&_input]:bg-canvas-alt [&_input]:text-text-secondary"
        />
      </Section>

      <Section title={t('profile.section_language')}>
        <SelectField
          label={t('profile.language')}
          value={draft.locale}
          onChange={(locale) => setDraft((d) => ({ ...d, locale }))}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('profile.time_zone')}
          value={draft.timezone}
          onChange={(timezone) => setDraft((d) => ({ ...d, timezone }))}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </SelectField>
      </Section>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div>
        <Button type="submit" variant="primary" size="lg" disabled={!canSave}>
          {pending ? t('profile.saving') : t('profile.save')}
        </Button>
      </div>

      <Section title={t('profile.section_sign_in')}>
        <ul className="divide-y divide-border rounded-sm border border-border">
          {SIGN_IN_PROVIDERS.map((provider) => {
            const linked = linkedProviders.includes(provider.id);
            return (
              <li key={provider.id} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[15px] text-text">{provider.label}</span>
                <Badge tone={linked ? 'positive' : 'neutral'}>{linked ? t('profile.linked') : t('profile.not_linked')}</Badge>
              </li>
            );
          })}
        </ul>
      </Section>
    </form>
  );
}
