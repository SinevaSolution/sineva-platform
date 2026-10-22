'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SNBadge, SNButton, SNField, SNSelect, SNTooltipProvider } from '@sineva/ui';
import * as galleries from '@sineva/ui/gallery';
import { pseudoLocalize, LOCALES, type LocaleCode, type Messages } from '@sineva/i18n';
import { I18nProvider, useTranslations } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import { EmptyStatesGallery } from './empty_states_gallery';

function expandedMessages(messages: Messages): Messages {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [
      key,
      typeof value === 'string' ? pseudoLocalize(value) : expandedMessages(value),
    ]),
  );
}

export function ComponentGallery(props: {
  theme: 'light' | 'dark';
  locale: LocaleCode;
  pseudo: boolean;
  width: number;
  component?: string;
}) {
  const messages = React.useMemo(
    () => (props.pseudo ? expandedMessages(CATALOGS[props.locale]) : CATALOGS[props.locale]),
    [props.locale, props.pseudo],
  );
  React.useEffect(() => {
    const root = document.documentElement;
    const theme = root.getAttribute('data-theme');
    const lang = root.lang;
    root.setAttribute('data-theme', props.theme);
    root.lang = props.locale;
    return () => {
      if (theme) root.setAttribute('data-theme', theme);
      else root.removeAttribute('data-theme');
      root.lang = lang;
    };
  }, [props.theme, props.locale]);
  return (
    <I18nProvider locale={props.locale} messages={messages}>
      <SNTooltipProvider>
        <GalleryContent {...props} />
      </SNTooltipProvider>
    </I18nProvider>
  );
}

function GalleryContent({
  theme,
  locale,
  pseudo,
  width,
  component,
}: {
  theme: 'light' | 'dark';
  locale: LocaleCode;
  pseudo: boolean;
  width: number;
  component?: string;
}) {
  const t = useTranslations('dev_ui');
  const router = useRouter();
  // App-level galleries (registries that live in the web app, not in @sineva/ui).
  const entries = [
    ...Object.entries(galleries).map(([name, Gallery]) => ({
      name: name.replace(/Gallery$/, ''),
      Gallery,
    })),
    { name: 'EmptyStates', Gallery: EmptyStatesGallery },
  ];
  const visible = component ? entries.filter((entry) => entry.name === component) : entries;
  const link = (values: Record<string, string>) =>
    `/dev/ui?${new URLSearchParams({ theme, locale, pseudo: pseudo ? '1' : '0', width: String(width), ...(component ? { component } : {}), ...values })}`;
  return (
    <main
      className="mx-auto space-y-6 wrap-anywhere bg-canvas-alt p-4 text-text sm:p-8"
      style={{ maxWidth: width }}
      data-testid="component-gallery"
    >
      <header className="space-y-3">
        <SNBadge>{t('sample')}</SNBadge>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-text-secondary">{t('description')}</p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label={t('theme')}>
        <SNButton asChild variant={theme === 'light' ? 'primary' : 'secondary'}>
          <Link href={link({ theme: 'light' })}>{t('light')}</Link>
        </SNButton>
        <SNButton asChild variant={theme === 'dark' ? 'primary' : 'secondary'}>
          <Link href={link({ theme: 'dark' })}>{t('dark')}</Link>
        </SNButton>
        <SNButton asChild>
          <Link href={link({ locale: locale === 'en' ? 'id' : 'en' })} aria-label={t('locale')}>
            {LOCALES.find((entry) => entry.code !== locale)?.native_name}
          </Link>
        </SNButton>
        <SNButton asChild>
          <Link href={link({ pseudo: pseudo ? '0' : '1' })}>
            {pseudo ? t('normal') : t('pseudo')}
          </Link>
        </SNButton>
      </nav>
      <div className="flex flex-wrap items-end gap-3">
        <SNField label={t('width')}>
          <SNSelect
            value={String(width)}
            onValueChange={(value) => router.push(link({ width: value }))}
            options={[360, 390, 834, 1024, 1440].map((value) => ({
              value: String(value),
              label: String(value),
            }))}
          />
        </SNField>
      </div>
      <nav aria-label={t('components')} className="flex flex-wrap gap-3 text-sm text-text-brand">
        {entries.map(({ name }) => (
          <Link
            key={name}
            href={`#${name}`}
            className="underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {name}
          </Link>
        ))}
      </nav>
      {visible.map(({ name, Gallery }) => (
        <div
          key={name}
          id={name}
          className="scroll-mt-6 rounded-lg border border-border bg-surface p-4 sm:p-6"
        >
          {name === 'SNButton' ? (
            <galleries.SNButtonGallery
              disabledLabel={t('disabled')}
              loadingLabel={t('loading')}
              pillLabel={t('pill')}
            />
          ) : (
            <Gallery />
          )}
        </div>
      ))}
    </main>
  );
}
