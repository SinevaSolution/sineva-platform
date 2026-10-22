import { describe, expect, it } from 'vitest';
import { createCardRegistry, type CardUpcaster } from './registry';
import { TEST_ONLY_SCHEMAS } from './test_support';

const noteToBody: CardUpcaster = {
  card_type: 'test_only_card',
  from: 1,
  to: 2,
  upcast: (data) => {
    const { note, ...rest } = data as { note?: string };
    return note === undefined ? rest : { ...rest, body: note };
  },
};

function v1(data: Record<string, unknown>) {
  return {
    card_type: 'test_only_card',
    schema_version: 1,
    data,
    actions: [],
    provider: null,
    fallback_text: 'x',
  };
}

describe('upcast on read (FR-AX-13: N and N-1)', () => {
  it('supports N-1 by upcasting through a pure function', () => {
    const registry = createCardRegistry({ schemas: TEST_ONLY_SCHEMAS, upcasters: [noteToBody] });
    const input = v1({ name: 'Rina', note: 'hello' });
    const before = JSON.stringify(input);
    const now = new Date('2026-10-22T00:00:00.000Z');
    const result = registry.validateDisplay(input, { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.schema_version).toBe(2);
    expect(result.card.data).toEqual({ name: 'Rina', body: 'hello' });
    // Pure: the same input gives the same output and is never mutated.
    expect(JSON.stringify(input)).toBe(before);
    expect(registry.validateDisplay(input, { now })).toEqual(result);
  });

  it('rejects N-1 when no upcaster exists', () => {
    const registry = createCardRegistry({ schemas: TEST_ONLY_SCHEMAS });
    const result = registry.validateDisplay(v1({ name: 'Rina' }));
    expect(result).toMatchObject({ ok: false, code: 'unsupported_version' });
  });

  it('rejects N-2 even with an upcaster chain gap', () => {
    const v3 = { ...TEST_ONLY_SCHEMAS[1]!, version: 3 };
    const registry = createCardRegistry({
      schemas: [...TEST_ONLY_SCHEMAS, v3],
      upcasters: [noteToBody, { ...noteToBody, from: 2, to: 3, upcast: (d) => d }],
    });
    expect(registry.validateDisplay(v1({ name: 'Rina' }))).toMatchObject({
      ok: false,
      code: 'unsupported_version',
    });
  });

  it('rejects when the upcast output is not valid for the newer version', () => {
    const broken: CardUpcaster = { ...noteToBody, upcast: () => ({ unknown: true }) };
    const registry = createCardRegistry({ schemas: TEST_ONLY_SCHEMAS, upcasters: [broken] });
    expect(registry.validateDisplay(v1({ name: 'Rina' }))).toMatchObject({
      ok: false,
      code: 'upcast_failed',
    });
  });

  it('rejects when an upcaster throws', () => {
    const throwing: CardUpcaster = {
      ...noteToBody,
      upcast: () => {
        throw new Error('boom');
      },
    };
    const registry = createCardRegistry({ schemas: TEST_ONLY_SCHEMAS, upcasters: [throwing] });
    expect(registry.validateDisplay(v1({ name: 'Rina' }))).toMatchObject({
      ok: false,
      code: 'upcast_failed',
    });
  });

  it('production registry has an empty upcaster set today', async () => {
    const { PRODUCTION_UPCASTERS } = await import('./index');
    expect(PRODUCTION_UPCASTERS).toEqual([]);
  });
});
