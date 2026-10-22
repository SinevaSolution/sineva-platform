import { describe, expect, it } from 'vitest';
import { createCardRegistry, type CardValidationResult } from './registry';
import { cardRegistry } from './index';
import { TEST_ONLY_SCHEMAS } from './test_support';

const MEDIA_REF = '7b8c9d0e-1f2a-4b4c-8d6e-7f8a9b0c1d2e';

function display(over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    card_type: 'test_only_card',
    schema_version: 1,
    data: { name: 'Rina', ...data },
    actions: [],
    provider: null,
    fallback_text: 'Rina',
    ...over,
  };
}

function guardrail(over: Record<string, unknown> = {}) {
  return {
    card_type: 'guardrail_notice',
    schema_version: 1,
    data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
    actions: [{ id: 'prepare', kind: 'send_to_chat', label_key: 'cards.guardrail.prepare' }],
    provider: null,
    fallback_text: 'I cannot move money. I can prepare the details for you.',
    ...over,
  };
}

// Version 1 only: the upcast tests cover the two-version case.
const registry = createCardRegistry({ schemas: TEST_ONLY_SCHEMAS.slice(0, 1) });

function rejected(result: CardValidationResult) {
  if (result.ok) throw new Error('expected a rejection');
  return result;
}

describe('guardrail_notice v1 (FR-AX-06, FR-AX-08, FR-AX-25)', () => {
  it('accepts a valid payload and returns the normalised card', () => {
    const result = cardRegistry.validateDisplay(guardrail());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card).toMatchObject({
      card_type: 'guardrail_notice',
      schema_version: 1,
      data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
    });
    expect(result.card.payload_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a missing required field', () => {
    const result = rejected(
      cardRegistry.validateDisplay(guardrail({ data: { specialist: 'sinofinance', limit_key: 'x' } })),
    );
    expect(result.code).toBe('schema_invalid');
  });

  it('rejects an unknown field (additionalProperties false)', () => {
    const result = rejected(
      cardRegistry.validateDisplay(
        guardrail({
          data: { specialist: 'sinofinance', limit_key: 'x', offer_key: 'y', html: '<b>hi</b>' },
        }),
      ),
    );
    expect(result.code).toBe('schema_invalid');
  });

  it('rejects a key that is not a snake_case message key', () => {
    const result = rejected(
      cardRegistry.validateDisplay(
        guardrail({ data: { specialist: 'sinofinance', limit_key: '<script>', offer_key: 'y' } }),
      ),
    );
    expect(result.code).toBe('schema_invalid');
  });
});

describe('envelope and registry (FR-AX-09)', () => {
  it('rejects an unknown card_type and keeps the fallback text', () => {
    const result = rejected(registry.validateDisplay(display({ card_type: 'runway_metrics' })));
    expect(result.code).toBe('unknown_card_type');
    expect(result.fallback_text).toBe('Rina');
  });

  it('rejects an unsupported version', () => {
    expect(rejected(registry.validateDisplay(display({ schema_version: 99 }))).code).toBe(
      'unsupported_version',
    );
    expect(rejected(registry.validateDisplay(display({ schema_version: 0 }))).code).toBe(
      'unsupported_version',
    );
  });

  it('reduces a semver string to its major version', () => {
    const result = registry.validateDisplay(display({ schema_version: '1.0.1' }, { name: 'Rina' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.card.schema_version).toBe(1);
  });

  it('rejects a non-object display and a display without fallback text', () => {
    expect(rejected(registry.validateDisplay(undefined)).code).toBe('display_missing');
    expect(rejected(registry.validateDisplay('text')).code).toBe('display_missing');
    const result = rejected(registry.validateDisplay(display({ fallback_text: undefined })));
    expect(result.code).toBe('fallback_missing');
    expect(result.fallback_text).toBeNull();
  });

  it('rejects a card over 64 KB before schema work, keeping short fallback text', () => {
    const big = display({}, { padding: 'x'.repeat(70_000) });
    const result = rejected(registry.validateDisplay(big));
    expect(result.code).toBe('too_large');
    expect(result.fallback_text).toBe('Rina');
  });

  it('measures size in bytes, not characters', () => {
    // 22,000 three-byte characters are about 66 KB but only 22,000 characters.
    const wide = display({}, { name: '€'.repeat(22_000) });
    expect(rejected(registry.validateDisplay(wide)).code).toBe('too_large');
  });

  it('rejects an array above its cap and an overlong string', () => {
    expect(
      rejected(registry.validateDisplay(display({}, { tags: ['a', 'b', 'c', 'd', 'e', 'f'] }))).code,
    ).toBe('schema_invalid');
    expect(rejected(registry.validateDisplay(display({}, { note: 'n'.repeat(201) }))).code).toBe(
      'schema_invalid',
    );
  });

  it('rejects action kinds that are not allowed (FR-AX-14)', () => {
    for (const kind of ['pay', 'transfer', 'hire', 'refund', 'sign', 'made_up']) {
      const result = rejected(
        registry.validateDisplay(display({ actions: [{ id: 'a', kind, label_key: 'cards.x' }] })),
      );
      expect(result.code, kind).toBe('schema_invalid');
    }
  });

  it('accepts a known action kind and a typed provider', () => {
    const result = registry.validateDisplay(
      display({
        actions: [{ id: 'copy', kind: 'copy', label_key: 'cards.copy' }],
        provider: {
          slug: 'gmail',
          account_label: 'rina@example.com',
          connection_id: '7b8c9d0e-1f2a-4b4c-8d6e-7f8a9b0c1d2e',
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown field on the provider object', () => {
    const result = rejected(
      registry.validateDisplay(display({ provider: { slug: 'gmail', token: 'secret' } })),
    );
    expect(result.code).toBe('schema_invalid');
  });
});

describe('typed strings (FR-AX-09, FR-AX-50)', () => {
  it('strips bidi and zero-width characters from sanitised fields only', () => {
    const result = registry.validateDisplay(
      display(
        {},
        {
          name: 'Ri‮na​⁦',
          subject: '﻿Hello‏',
          note: 'keep​me',
        },
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.data).toMatchObject({ name: 'Rina', subject: 'Hello', note: 'keep​me' });
  });

  it('does not change the caller input while sanitising', () => {
    const input = display({}, { name: 'Ri‮na' });
    registry.validateDisplay(input);
    expect((input.data as { name: string }).name).toBe('Ri‮na');
  });

  it('rejects javascript:, http: and other schemes in a link field', () => {
    for (const website of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'http://example.com',
      'data:text/html,hi',
      'mailto:a@b.co',
      '//example.com',
      'example.com',
      'https://user:pw@example.com',
    ]) {
      const result = rejected(registry.validateDisplay(display({}, { website })));
      expect(result.code, website).toBe('bad_link');
    }
  });

  it('accepts an https link, also inside an array item', () => {
    expect(registry.validateDisplay(display({}, { website: 'https://sineva.id/path?q=1' })).ok).toBe(true);
    const bad = registry.validateDisplay(
      display({}, { items: [{ label: 'x', link: 'javascript:alert(1)' }] }),
    );
    expect(rejected(bad).code).toBe('bad_link');
  });

  it('accepts mailto: and tel: only in a contact field', () => {
    expect(registry.validateDisplay(display({}, { email: 'mailto:rina@example.com' })).ok).toBe(true);
    expect(registry.validateDisplay(display({}, { email: 'tel:+628123456789' })).ok).toBe(true);
    expect(rejected(registry.validateDisplay(display({}, { email: 'https://example.com' }))).code).toBe(
      'bad_contact',
    );
    expect(rejected(registry.validateDisplay(display({}, { email: 'javascript:1' }))).code).toBe(
      'bad_contact',
    );
  });

  it('rejects a URL or a scheme inside a plain text field', () => {
    for (const note of [
      'https://example.com',
      'see https://example.com now',
      'javascript:alert(1)',
      ' mailto:a@b.co',
      'tel:+62812',
      'data:text/html;base64,AAAA',
    ]) {
      const result = rejected(registry.validateDisplay(display({}, { note })));
      expect(result.code, note).toBe('untyped_url');
    }
  });

  it('keeps ordinary prose that merely contains a colon', () => {
    expect(registry.validateDisplay(display({}, { note: 'Note: total is 5, data: ok' })).ok).toBe(true);
  });

  it('accepts a media_ref uuid and rejects a URL or any other value there', () => {
    expect(registry.validateDisplay(display({}, { image: MEDIA_REF })).ok).toBe(true);
    for (const image of ['https://example.com/a.png', 'data:image/png;base64,AAAA', 'not-a-uuid']) {
      expect(rejected(registry.validateDisplay(display({}, { image }))).code, image).toBe('bad_media_ref');
    }
  });

  it('checks typed strings after sanitising, so a hidden character cannot smuggle a scheme', () => {
    const result = rejected(registry.validateDisplay(display({}, { name: 'java​script:alert(1)' })));
    expect(result.code).toBe('untyped_url');
  });
});

describe('persistence metadata', () => {
  it('computes data_expires_at from the root x-ttl', () => {
    const now = new Date('2026-10-22T00:00:00.000Z');
    const result = registry.validateDisplay(display(), { now });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.card.data_expires_at).toBe('2026-11-21T00:00:00.000Z');
  });

  it('has no expiry when the schema has no x-ttl', () => {
    const result = cardRegistry.validateDisplay(guardrail());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.card.data_expires_at).toBeNull();
  });

  it('hashes the validated data stably, regardless of key order', () => {
    const a = registry.validateDisplay(display({}, { subject: 's' }));
    const reordered: Record<string, unknown> = display();
    reordered.data = { subject: 's', name: 'Rina' };
    const b = registry.validateDisplay(reordered);
    expect(a.ok && b.ok && a.card.payload_hash === b.card.payload_hash).toBe(true);
  });
});
