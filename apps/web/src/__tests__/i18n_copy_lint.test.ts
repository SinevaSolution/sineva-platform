import { describe, expect, it } from 'vitest';
import {
  DO_NOT_TRANSLATE,
  lintCatalog,
  lintCatalogPair,
  lintCopyString,
  type Messages,
} from '@sineva/i18n';
import { EMAIL_TEMPLATES, type EmailLocale, type EmailTemplateName } from '@/server/application/email/templates';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

const rules = (value: string, locale: 'en' | 'id' = 'en', key = 'x.y') =>
  lintCopyString(value, { locale, key }).map((v) => v.rule);

describe('copy rules: every violating fixture must fail', () => {
  it.each([
    'Your assistant is ready',
    'Meet the chatbot',
    'Six agents at work',
    'Ask the bot',
    'Spend your credits',
    'Assistants help you',
  ])('rejects the banned English word in "%s"', (text) => {
    expect(rules(text)).toContain('banned_word');
  });

  it.each(['Asisten kamu siap', 'Pembantu kamu siap', 'Habiskan kredit kamu', 'Agen kamu', 'Chatbot kamu'])(
    'rejects the banned Indonesian word in "%s"',
    (text) => {
      expect(rules(text, 'id')).toContain('banned_word');
    },
  );

  it('matches whole words only, so agenda, robot and bottom pass', () => {
    expect(rules('Set the agenda for the robot at the bottom')).toEqual([]);
  });

  it('rejects an em dash and an en dash', () => {
    expect(rules('Sino helps — always')).toContain('dash');
    expect(rules('Pick 10–50 items')).toContain('dash');
  });

  it('rejects a comma after a mention, but not a mention followed by a request', () => {
    expect(rules('@SinoHelp, reply to this customer')).toContain('mention_comma');
    expect(rules('@SinoFinance and @SinoInsights review last month')).toEqual([]);
    expect(rules('@SinoSales draft a follow-up')).toEqual([]);
  });

  it('rejects internal vocabulary: BFF', () => {
    expect(rules('Sent through the BFF')).toContain('internal_term');
  });

  it('rejects "Submit" and "Click here"', () => {
    expect(rules('Submit')).toContain('banned_phrase');
    expect(rules('Click here to continue')).toContain('banned_phrase');
  });

  it('rejects "Anda" and "saya" in Indonesian, which uses kamu and aku', () => {
    expect(rules('Akun Anda siap', 'id')).toContain('voice');
    expect(rules('Saya akan membantu', 'id')).toContain('voice');
    expect(rules('Akun kamu siap. Aku bantu.', 'id')).toEqual([]);
  });

  it('allows the word "Anda" in English copy: the rule is about Indonesian voice', () => {
    expect(rules('Anda', 'en')).toEqual([]);
  });

  it('rejects emoji in system copy', () => {
    expect(rules('All set \u{1F389}')).toContain('emoji');
  });

  it('rejects loan words on SinoFinance surfaces only', () => {
    expect(rules('SinoFinance can find you a loan')).toContain('sinofinance_word');
    expect(rules('Ask about a payment', 'en', 'specialists.sinofinance.blurb')).toEqual([]);
    expect(rules('A loan', 'en', 'specialists.sinofinance.blurb')).toContain('sinofinance_word');
    expect(rules('Pinjaman', 'id', 'specialists.sinofinance.blurb')).toContain('sinofinance_word');
    expect(rules('A loan guide')).toEqual([]);
  });
});

describe('catalog lint', () => {
  it('walks nested keys and reports the offending key', () => {
    const violations = lintCatalog('en', { a: { b: 'Fine', c: 'Ask the assistant' } });
    expect(violations).toEqual([expect.objectContaining({ key: 'a.c', rule: 'banned_word' })]);
  });

  it('covers the reserved mcp namespace', () => {
    const violations = lintCatalog('en', { mcp: { tool: { name: 'Run the agent' } } });
    expect(violations.map((v) => v.key)).toEqual(['mcp.tool.name']);
  });

  it('rejects an empty message', () => {
    expect(lintCatalog('en', { a: '   ' }).map((v) => v.rule)).toContain('empty');
  });
});

describe('catalog pair lint: every violating fixture must fail', () => {
  const base: Record<string, Messages> = {
    en: { a: { one: 'Hello {name}', two: 'Open your Inbox' } },
    id: { a: { one: 'Halo {name}', two: 'Buka Inbox kamu' } },
  };

  it('passes a clean pair', () => {
    expect(lintCatalogPair(base)).toEqual([]);
  });

  it('fails when a key is missing in Indonesian', () => {
    const pair = { ...base, id: { a: { one: 'Halo {name}' } } };
    expect(lintCatalogPair(pair)).toEqual([expect.objectContaining({ rule: 'missing_key', key: 'a.two', locale: 'id' })]);
  });

  it('fails when a key exists only in Indonesian', () => {
    const pair = { ...base, id: { a: { one: 'Halo {name}', two: 'Buka Inbox kamu', three: 'Extra' } } };
    expect(lintCatalogPair(pair)).toEqual([expect.objectContaining({ rule: 'extra_key', key: 'a.three' })]);
  });

  it('fails when a placeholder is dropped or renamed', () => {
    const pair = { ...base, id: { a: { one: 'Halo {nama}', two: 'Buka Inbox kamu' } } };
    expect(lintCatalogPair(pair)).toEqual([expect.objectContaining({ rule: 'param_mismatch', key: 'a.one' })]);
  });

  it('fails when a protected name is translated away', () => {
    const pair = { ...base, id: { a: { one: 'Halo {name}', two: 'Buka Kotak Masuk kamu' } } };
    const rulesFound = lintCatalogPair(pair).map((v) => v.rule);
    expect(rulesFound).toContain('protected_name');
  });

  it.each([
    ['Room', 'Buka Ruang kamu', 'Open your Room'],
    ['Squad', 'Buka Skuad kamu', 'Open your Squad'],
    ['Workflow', 'Buka Alur Kerja kamu', 'Open your Workflow'],
    ['Routine', 'Buka Rutinitas kamu', 'Open your Routine'],
    ['Skill', 'Buka Keterampilan kamu', 'Open your Skill'],
    ['Sino Library', 'Buka Perpustakaan Sino', 'Open Sino Library'],
    ['SinoFinance', 'Buka SinoKeuangan', 'Open SinoFinance'],
  ])('fails when %s is translated', (_name, idText, enText) => {
    const pair = { en: { a: enText }, id: { a: idText } };
    expect(lintCatalogPair(pair).map((v) => v.rule)).toContain('protected_name');
  });

  it('keeps the protected list in sync with the Founder decision', () => {
    for (const name of ['Sino', 'Sino Library', 'Room', 'Squad', 'Workflow', 'Routine', 'Skill', 'Inbox']) {
      expect(DO_NOT_TRANSLATE).toContain(name);
    }
  });

  it('requires "Spesialis" and "Aplikasi terhubung" in Indonesian', () => {
    const bad = { en: { a: 'Your specialists', b: 'Connected tools' }, id: { a: 'Specialist kamu', b: 'Connected tools' } };
    expect(lintCatalogPair(bad).map((v) => v.rule)).toEqual(['required_term', 'required_term']);
    const good = { en: { a: 'Your specialists', b: 'Connected tools' }, id: { a: 'Spesialis kamu', b: 'Aplikasi terhubung' } };
    expect(lintCatalogPair(good)).toEqual([]);
  });

  it('lints copy of every locale in the pair', () => {
    const pair = { en: { a: 'Fine' }, id: { a: 'Asisten kamu' } };
    expect(lintCatalogPair(pair).map((v) => v.rule)).toContain('banned_word');
  });
});

describe('shipped catalogs', () => {
  it('pass the copy rules in English', () => {
    expect(lintCatalog('en', en)).toEqual([]);
  });

  it('pass the copy rules in Indonesian', () => {
    expect(lintCatalog('id', id)).toEqual([]);
  });

  it('have the same keys, params and protected names in both languages', () => {
    expect(lintCatalogPair({ en, id })).toEqual([]);
  });

  it('reserve the mcp namespace in both', () => {
    expect(en).toHaveProperty('mcp');
    expect(id).toHaveProperty('mcp');
  });
});

describe('system-authored content: email templates', () => {
  const params = {
    verify_email: { recipient_name: 'Budi', url: 'https://app.sineva.id/v?t=1', expires_in_minutes: 30 },
    reset_password: { recipient_name: 'Budi', url: 'https://app.sineva.id/r?t=1', expires_in_minutes: 30 },
    lockout_notice: { recipient_name: 'Budi', lockout_duration_minutes: 15, attempt_time: '2026-10-21 14:00 UTC' },
    email_change_confirm: {
      recipient_name: 'Budi',
      new_email: 'budi.new@example.com',
      url: 'https://app.sineva.id/c?t=1',
      expires_in_minutes: 30,
    },
    email_change_notice: {
      recipient_name: 'Budi',
      new_email: 'budi.new@example.com',
      revert_url: 'https://app.sineva.id/support',
    },
    workspace_invitation: {
      url: 'https://app.sineva.id/invite/tok',
      workspace_name: 'Warung Sari',
      inviter_name: 'Sari',
      role: 'member',
      expires_in_days: 7,
    },
    ownership_transfer_request: {
      recipient_name: 'Budi',
      url: 'https://app.sineva.id/ownership/tok',
      workspace_name: 'Warung Sari',
      from_name: 'Sari',
      expires_in_days: 7,
    },
    ownership_transferred_notice: {
      recipient_name: 'Budi',
      workspace_name: 'Warung Sari',
      other_name: 'Sari',
      new_role: 'owner',
    },
  } as const;

  for (const name of Object.keys(params) as EmailTemplateName[]) {
    for (const locale of ['en', 'id'] as EmailLocale[]) {
      it(`${name} (${locale}) passes the copy rules`, () => {
        const template = EMAIL_TEMPLATES[name][locale] as { render: (p: unknown) => { subject: string; text: string } };
        const mail = template.render(params[name]);
        const lines = [mail.subject, ...mail.text.split('\n')].filter((l) => l.trim() && !l.startsWith('http'));
        const violations = lines.flatMap((line) => lintCopyString(line, { locale, key: `email.${name}` }));
        expect(violations).toEqual([]);
      });
    }
  }
});
