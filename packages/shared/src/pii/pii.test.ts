import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPii, mask, PII_PLACEHOLDERS, type PiiKind } from './index';

interface VectorCase {
  id: string;
  description: string;
  input: string;
  expected_matches: Array<{ kind: PiiKind; text: string }>;
  expected_masked: string;
}

interface VectorFile {
  version: number;
  placeholders: Record<PiiKind, string>;
  cases: VectorCase[];
}

// Read through fs instead of a JSON import: the file is shared byte for byte
// with sineva-ai and must stay a plain data file with no TS resolution tricks.
const vectors = JSON.parse(
  readFileSync(join(import.meta.dirname, 'vectors', 'pii_vectors.json'), 'utf8'),
) as VectorFile;

describe('PII vectors (FR-SEC-19, FR-SEC-20, FR-SEC-39)', () => {
  it('has positive and negative cases for every kind', () => {
    expect(vectors.cases.length).toBeGreaterThan(30);
    const kinds = new Set<PiiKind>(
      vectors.cases.flatMap((c) => c.expected_matches.map((m) => m.kind)),
    );
    expect([...kinds].sort()).toEqual(
      ['bank_account', 'email', 'nik', 'npwp', 'phone', 'secret'].sort(),
    );
    expect(vectors.cases.some((c) => c.expected_matches.length === 0)).toBe(true);
  });

  it('uses the placeholders the vectors file declares', () => {
    expect(PII_PLACEHOLDERS).toEqual(vectors.placeholders);
  });

  describe.each(vectors.cases)('$id', (c) => {
    it('detects exactly the expected spans', () => {
      const found = detectPii(c.input).map((m) => ({
        kind: m.kind,
        text: c.input.slice(m.start, m.end),
      }));
      expect(found).toEqual(c.expected_matches);
    });

    it('masks to the expected text', () => {
      expect(mask(c.input)).toBe(c.expected_masked);
    });

    it('is idempotent', () => {
      expect(mask(mask(c.input))).toBe(mask(c.input));
    });
  });
});

describe('mask', () => {
  it('returns an empty string unchanged', () => {
    expect(mask('')).toBe('');
  });

  // Logs can carry megabytes of arbitrary text, so a pattern that rescans from
  // every start position (quadratic) would stall the request that logs it.
  it.each([
    ['digit run', '0'.repeat(200_000)],
    ['address characters without @', 'a.'.repeat(100_000)],
    ['spaced digits', '0 '.repeat(100_000)],
    ['hyphen run', '-'.repeat(200_000)],
    ['repeated PEM headers', '-----BEGIN PRIVATE KEY-----'.repeat(5_000)],
    ['repeated keywords', 'rek '.repeat(50_000)],
    ['repeated @', 'a@'.repeat(100_000)],
  ])('stays fast and does not throw on %s', (_label, input) => {
    const startedAt = performance.now();
    expect(() => mask(input)).not.toThrow();
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
