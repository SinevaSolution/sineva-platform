// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InboxEmailAction } from '@/client/components/inbox/inbox_email_action';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
afterEach(cleanup);
describe('Gmail approval preview', () => {
  it.each(['en', 'id'] as const)(
    'shows the account, exact recipients, subject and escaped body in %s',
    (locale) => {
      const { container } = render(
        <I18nProvider locale={locale} messages={CATALOGS[locale]}>
          <InboxEmailAction
            payload={{
              account_label: 'sender@example.com',
              request: {
                arguments: {
                  to: ['person@example.com'],
                  cc: ['copy@example.com'],
                  subject: 'Hello',
                  body_text: '<img src="https://example.test/track"> Hello',
                },
              },
            }}
          />
        </I18nProvider>,
      );
      expect(screen.getByText('sender@example.com')).toBeTruthy();
      expect(screen.getByText('person@example.com')).toBeTruthy();
      expect(screen.getByText('copy@example.com')).toBeTruthy();
      expect(screen.getByText('Hello', { exact: true })).toBeTruthy();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
    },
  );
});
