'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Pill, SelectInput, Switch, TextArea, TextInput } from '@/client/components/ui/controls';
import { FormAlert } from '@/client/components/ui/field';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import { LOCALE_COOKIE } from '@sineva/i18n';
import type { MeView, MemberProfileView, ProfileView } from '@/shared/profile_view';
import { AvatarEditor } from './avatar_editor';
import {
  ABOUT_ME_MAX,
  buildProfilePatch,
  DEPARTMENTS,
  FULL_NAME_MAX,
  greetingName,
  hasChanges,
  isDraftSavable,
  JOB_TITLE_MAX,
  LOCALE_OPTIONS,
  PREFERRED_NAME_MAX,
  SALUTATION_WORDS,
  SALUTATIONS,
  timeZoneOptions,
  toDraft,
  validateDraft,
  type DraftErrorKey,
  type ProfileDraft,
} from './profile_form_model';
import { SaveBar } from './save_bar';
import { SettingsRow, SettingsSection } from './settings_layout';

export interface ProfileWorkspace {
  id: string;
  name: string;
  role: string;
}

export function ProfileForm({
  profile: initialProfile,
  member: initialMember,
  workspace,
  timeZones,
}: {
  profile: ProfileView;
  member: MemberProfileView;
  workspace: ProfileWorkspace;
  /** Resolved on the server so the option list is identical during hydration. */
  timeZones: string[];
}) {
  const router = useRouter();
  const t = useTranslations('account');
  const errorText = useApiErrorText();
  const [profile, setProfile] = React.useState(initialProfile);
  const [member, setMember] = React.useState(initialMember);
  const saved = React.useMemo(() => toDraft(profile, member), [profile, member]);
  const [draft, setDraft] = React.useState<ProfileDraft>(saved);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [serverErrors, setServerErrors] = React.useState<Partial<Record<keyof ProfileDraft, string>>>({});
  const [touched, setTouched] = React.useState<ReadonlySet<keyof ProfileDraft>>(new Set());

  const zones = React.useMemo(() => timeZoneOptions(saved.timezone, timeZones), [saved.timezone, timeZones]);
  const patch = React.useMemo(() => buildProfilePatch(saved, draft), [saved, draft]);
  const dirty = hasChanges(patch);
  const clientErrors = validateDraft(draft);
  const canSave = isDraftSavable(saved, draft);

  function set<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }
  const touch = (key: keyof ProfileDraft) => () => setTouched((s) => new Set(s).add(key));

  function fieldError(key: keyof ProfileDraft): string | null {
    const client = touched.has(key) ? clientErrors[key] : undefined;
    if (client) return draftErrorText(client);
    return serverErrors[key] ?? null;
  }

  function draftErrorText(key: DraftErrorKey): string {
    switch (key) {
      case 'name_length':
        return t('profile.errors.name_length');
      case 'name_chars':
        return t('profile.errors.name_chars');
      case 'preferred_name_length':
        return t('profile.errors.preferred_name_length');
      case 'phone_invalid':
        return t('profile.errors.phone_invalid');
      case 'about_me_length':
        return t('profile.errors.about_me_length');
      case 'job_title_length':
        return t('profile.errors.job_title_length');
    }
  }

  function discard() {
    setDraft(saved);
    setFormError(null);
    setServerErrors({});
    setTouched(new Set());
  }

  async function save() {
    if (!canSave || pending) return;
    setPending(true);
    setFormError(null);
    setServerErrors({});
    let nextProfile = profile;
    let nextMember = member;
    try {
      // Two endpoints own the fields. Each success is kept even if the other
      // fails, so the bar never claims something is unsaved that is saved.
      if (Object.keys(patch.profile).length > 0) {
        const me = await apiRequest<MeView>('/api/v1/me', { method: 'PATCH', body: patch.profile });
        nextProfile = me;
        setProfile(me);
      }
      if (Object.keys(patch.member).length > 0) {
        nextMember = await apiRequest<MemberProfileView>(
          `/api/v1/workspaces/${workspace.id}/members/me`,
          { method: 'PATCH', body: patch.member },
        );
        setMember(nextMember);
      }
      // Normalised values (a phone typed as 0812... comes back as +62812...) replace the draft.
      setDraft(toDraft(nextProfile, nextMember));
      setTouched(new Set());
      // Signed-out pages (sign-in after a sign-out) read the language from
      // this cookie, since the profile is only known while signed in.
      document.cookie = `${LOCALE_COOKIE}=${nextProfile.locale}; path=/; max-age=31536000; samesite=lax`;
      toast.success(t('profile.saved'));
      // The shell and greetings read the name from the session on the server.
      router.refresh();
    } catch (err) {
      const message = errorText(err);
      const fields = (err as { fieldCodes?: Record<string, string> }).fieldCodes ?? {};
      const marked: Partial<Record<keyof ProfileDraft, string>> = {};
      for (const field of Object.keys(fields)) {
        if (field in draft) marked[field as keyof ProfileDraft] = message;
      }
      setServerErrors(marked);
      setFormError(message);
    } finally {
      setPending(false);
    }
  }

  const greeting = greetingName(draft);
  const aboutCount = [...draft.about_me].length;
  const id = React.useId();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
      className="space-y-9"
    >
      <div className="anim-rise flex items-center gap-5">
        <AvatarEditor
          avatarUrl={profile.avatar_url}
          name={draft.full_name}
          email={profile.email}
          onChanged={(next) => setProfile((p) => ({ ...p, ...next }))}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold text-fg">{draft.full_name.trim() || profile.email}</h2>
          {greeting ? (
            <p className="mt-0.5 truncate text-[14px] text-fg-secondary">{t('profile.call_you', { name: greeting })}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="min-w-0 truncate text-[13px] text-fg-tertiary">{profile.email}</span>
            {profile.email_verified ? (
              <Pill tone="positive">{t('profile.verified')}</Pill>
            ) : (
              <Pill tone="neutral">{t('profile.not_verified')}</Pill>
            )}
            <Pill tone="neutral">{roleLabel(workspace.role)}</Pill>
          </div>
        </div>
        <SinoFigure pose="wave" size={84} className="hidden sm:inline-flex" />
      </div>

      <SettingsSection title={t('profile.section_about')} delay={60}>
        <SettingsRow
          label={t('profile.full_name')}
          helper={t('profile.full_name_helper')}
          htmlFor={`${id}-full_name`}
          error={fieldError('full_name')}
        >
          <TextInput
            id={`${id}-full_name`}
            name="full_name"
            autoComplete="name"
            maxLength={FULL_NAME_MAX + 20}
            value={draft.full_name}
            aria-invalid={fieldError('full_name') ? true : undefined}
            aria-describedby={`${id}-full_name-helper`}
            onChange={(e) => set('full_name', e.target.value)}
            onBlur={touch('full_name')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('profile.preferred_name')}
          helper={t('profile.preferred_name_helper')}
          htmlFor={`${id}-preferred_name`}
          error={fieldError('preferred_name')}
        >
          <TextInput
            id={`${id}-preferred_name`}
            name="preferred_name"
            autoComplete="nickname"
            maxLength={PREFERRED_NAME_MAX + 20}
            value={draft.preferred_name}
            aria-invalid={fieldError('preferred_name') ? true : undefined}
            aria-describedby={`${id}-preferred_name-helper`}
            onChange={(e) => set('preferred_name', e.target.value)}
            onBlur={touch('preferred_name')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('profile.salutation')}
          helper={t('profile.salutation_helper')}
          htmlFor={`${id}-salutation`}
        >
          <SelectInput
            id={`${id}-salutation`}
            name="salutation"
            value={draft.salutation}
            aria-describedby={`${id}-salutation-helper`}
            onChange={(e) => set('salutation', e.target.value as ProfileDraft['salutation'])}
          >
            <option value="">{t('profile.salutation_unset')}</option>
            {SALUTATIONS.map((value) => (
              <option key={value} value={value}>
                {value === 'none' ? t('profile.salutation_none') : SALUTATION_WORDS[value]}
              </option>
            ))}
          </SelectInput>
        </SettingsRow>
        <SettingsRow
          label={t('profile.about_me')}
          helper={t('profile.about_me_helper')}
          htmlFor={`${id}-about_me`}
          error={fieldError('about_me')}
        >
          <TextArea
            id={`${id}-about_me`}
            name="about_me"
            rows={4}
            value={draft.about_me}
            aria-invalid={fieldError('about_me') ? true : undefined}
            aria-describedby={`${id}-about_me-helper`}
            onChange={(e) => set('about_me', e.target.value)}
            onBlur={touch('about_me')}
          />
          <p className="mt-1 text-right text-xs text-fg-tertiary">
            {t('profile.about_me_count', { count: aboutCount, max: ABOUT_ME_MAX })}
          </p>
        </SettingsRow>
        <SettingsRow
          inline
          label={t('profile.use_context')}
          helper={t('profile.use_context_helper')}
          htmlFor={`${id}-use_context`}
        >
          <Switch
            id={`${id}-use_context`}
            checked={draft.use_profile_in_context}
            aria-describedby={`${id}-use_context-helper`}
            onCheckedChange={(checked) => set('use_profile_in_context', checked)}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t('profile.section_contact')} delay={120}>
        <SettingsRow label={t('profile.email')} helper={t('profile.email_helper')} htmlFor={`${id}-email`}>
          <TextInput id={`${id}-email`} name="email" type="email" value={profile.email} readOnly />
        </SettingsRow>
        <SettingsRow
          label={t('profile.phone')}
          helper={t('profile.phone_helper')}
          htmlFor={`${id}-phone`}
          error={fieldError('phone_number')}
        >
          <TextInput
            id={`${id}-phone`}
            name="phone_number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft.phone_number}
            aria-invalid={fieldError('phone_number') ? true : undefined}
            aria-describedby={`${id}-phone-helper`}
            onChange={(e) => set('phone_number', e.target.value)}
            onBlur={touch('phone_number')}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t('profile.section_region')} delay={180}>
        <SettingsRow label={t('profile.language')} helper={t('profile.language_helper')} htmlFor={`${id}-locale`}>
          <SelectInput
            id={`${id}-locale`}
            name="locale"
            value={draft.locale}
            aria-describedby={`${id}-locale-helper`}
            onChange={(e) => set('locale', e.target.value)}
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </SettingsRow>
        <SettingsRow label={t('profile.time_zone')} helper={t('profile.time_zone_helper')} htmlFor={`${id}-timezone`}>
          <SelectInput
            id={`${id}-timezone`}
            name="timezone"
            value={draft.timezone}
            aria-describedby={`${id}-timezone-helper`}
            onChange={(e) => set('timezone', e.target.value)}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </SelectInput>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t('profile.section_workspace', { workspace: workspace.name })} delay={240}>
        <SettingsRow
          label={t('profile.job_title')}
          helper={t('profile.job_title_helper')}
          htmlFor={`${id}-job_title`}
          error={fieldError('job_title')}
        >
          <TextInput
            id={`${id}-job_title`}
            name="job_title"
            autoComplete="organization-title"
            maxLength={JOB_TITLE_MAX + 20}
            value={draft.job_title}
            aria-invalid={fieldError('job_title') ? true : undefined}
            aria-describedby={`${id}-job_title-helper`}
            onChange={(e) => set('job_title', e.target.value)}
            onBlur={touch('job_title')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('profile.department')}
          helper={t('profile.department_helper')}
          htmlFor={`${id}-department`}
        >
          <SelectInput
            id={`${id}-department`}
            name="department"
            value={draft.department}
            aria-describedby={`${id}-department-helper`}
            onChange={(e) => set('department', e.target.value as ProfileDraft['department'])}
          >
            <option value="">{t('profile.department_unset')}</option>
            {DEPARTMENTS.map((value) => (
              <option key={value} value={value}>
                {departmentLabel(value)}
              </option>
            ))}
          </SelectInput>
        </SettingsRow>
      </SettingsSection>

      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <SaveBar visible={dirty} pending={pending} canSave={canSave} onSave={() => void save()} onDiscard={discard} />
    </form>
  );

  function roleLabel(role: string): string {
    switch (role) {
      case 'owner':
        return t('roles.owner');
      case 'admin':
        return t('roles.admin');
      case 'viewer':
        return t('roles.viewer');
      default:
        return t('roles.member');
    }
  }

  function departmentLabel(value: (typeof DEPARTMENTS)[number]): string {
    switch (value) {
      case 'management':
        return t('departments.management');
      case 'finance':
        return t('departments.finance');
      case 'sales':
        return t('departments.sales');
      case 'marketing':
        return t('departments.marketing');
      case 'operations':
        return t('departments.operations');
      case 'hr':
        return t('departments.hr');
      case 'it':
        return t('departments.it');
      case 'customer_support':
        return t('departments.customer_support');
      case 'legal':
        return t('departments.legal');
      case 'other':
        return t('departments.other');
    }
  }
}
