import { describe, expect, it } from 'vitest';
import { createCardRegistry } from './registry';
import { PRODUCTION_SCHEMAS } from './index';

function entry(schema: Record<string, unknown>) {
  return [{ card_type: 'lint_case', version: 1, schema }];
}

const base = {
  type: 'object',
  additionalProperties: false,
  properties: { a: { type: 'string', maxLength: 5 } },
};

describe('schema lint (FR-AX-08: caps and closed objects)', () => {
  it('accepts a closed, capped schema', () => {
    expect(() => createCardRegistry({ schemas: entry(base) })).not.toThrow();
  });

  it('rejects an object that allows additional properties', () => {
    expect(() =>
      createCardRegistry({ schemas: entry({ ...base, additionalProperties: true }) }),
    ).toThrow(/additionalProperties/);
    const { additionalProperties: _omit, ...open } = base;
    expect(() => createCardRegistry({ schemas: entry(open) })).toThrow(/additionalProperties/);
  });

  it('rejects a string without maxLength and an array without maxItems', () => {
    expect(() =>
      createCardRegistry({
        schemas: entry({ ...base, properties: { a: { type: 'string' } } }),
      }),
    ).toThrow(/maxLength/);
    expect(() =>
      createCardRegistry({
        schemas: entry({
          ...base,
          properties: { a: { type: 'array', items: { type: 'string', maxLength: 2 } } },
        }),
      }),
    ).toThrow(/maxItems/);
  });

  it('rejects remote $ref and unknown annotations', () => {
    expect(() =>
      createCardRegistry({
        schemas: entry({ ...base, properties: { a: { $ref: 'https://evil.example/s.json' } } }),
      }),
    ).toThrow(/\$ref/);
    expect(() =>
      createCardRegistry({
        schemas: entry({
          ...base,
          properties: { a: { type: 'string', maxLength: 3, 'x-nope': true } },
        }),
      }),
    ).toThrow(/x-nope/);
  });

  it('rejects an x-origin that is not source or model', () => {
    expect(() =>
      createCardRegistry({
        schemas: entry({
          ...base,
          properties: { a: { type: 'string', maxLength: 3, 'x-origin': 'both' } },
        }),
      }),
    ).toThrow(/x-origin/);
  });

  it('every production schema passes the lint (they are loaded through the same factory)', () => {
    expect(PRODUCTION_SCHEMAS.length).toBeGreaterThan(0);
    expect(() => createCardRegistry({ schemas: PRODUCTION_SCHEMAS })).not.toThrow();
    for (const { card_type, version } of PRODUCTION_SCHEMAS) {
      expect(card_type).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(Number.isInteger(version)).toBe(true);
    }
  });
});
