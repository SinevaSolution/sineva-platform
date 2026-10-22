import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OAuthButtons, OrDivider } from '@/client/components/auth/oauth_buttons';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider, useLocale, useTranslations } from '@/i18n/provider';

const messages = {
  demo: { hello: 'Hi {name}', sent: 'We sent a link to {email}. Open it.' },
};

function Hello() {
  const t = useTranslations('demo');
  const locale = useLocale();
  return (
    <p data-locale={locale}>
      {t('hello', { name: 'Amira' })}
    </p>
  );
}

function Rich() {
  const t = useTranslations('demo');
  return <p>{t.rich('sent', { email: <strong>a@b.id</strong> })}</p>;
}

describe('I18nProvider', () => {
  it('gives client components their namespace and locale', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" messages={messages}>
        <Hello />
      </I18nProvider>,
    );
    expect(html).toContain('Hi Amira');
    expect(html).toContain('data-locale="en"');
  });

  it('renders rich params as elements around translated text', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" messages={messages}>
        <Rich />
      </I18nProvider>,
    );
    expect(html).toContain('We sent a link to <strong>a@b.id</strong>. Open it.');
  });

  it('refuses to render a translated component without a provider', () => {
    expect(() => renderToStaticMarkup(<Hello />)).toThrow(/I18nProvider/);
  });

  it('renders shipped components in the active language', () => {
    const render = (locale: 'en' | 'id') =>
      renderToStaticMarkup(
        <I18nProvider locale={locale} messages={CATALOGS[locale]}>
          <OAuthButtons />
          <OrDivider />
        </I18nProvider>,
      );
    expect(render('en')).toContain('Continue with Google');
    expect(render('en')).toContain('or use email');
    expect(render('id')).toContain('Lanjut dengan Google');
    expect(render('id')).toContain('atau pakai email');
  });
});
