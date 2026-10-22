import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLATFORM_COPY = join(import.meta.dirname, 'vectors', 'pii_vectors.json');
// <repo>/packages/shared/src/pii -> repo root is four levels up.
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const SINEVA_AI_COPY =
  process.env.SINEVA_AI_PII_VECTORS ??
  resolve(REPO_ROOT, '..', 'sineva-ai', 'tests', 'fixtures', 'pii_vectors.json');

const copyExists = existsSync(SINEVA_AI_COPY);

describe('pii_vectors.json drift against sineva-ai', () => {
  // The skip reason lives in the test title because vitest does not print
  // skip reasons: a green run must not read as "compared and identical".
  it.skipIf(!copyExists)(
    copyExists
      ? 'platform copy is byte-identical to the sineva-ai copy'
      : `SKIPPED: no sineva-ai copy at ${SINEVA_AI_COPY} (sineva-ai must copy pii_vectors.json byte for byte, see vectors/README.md)`,
    () => {
      const platform = readFileSync(PLATFORM_COPY);
      const upstream = readFileSync(SINEVA_AI_COPY);
      expect(platform.equals(upstream)).toBe(true);
    },
  );

  it('the platform copy is the versioned vectors file (not empty)', () => {
    const parsed = JSON.parse(readFileSync(PLATFORM_COPY, 'utf8')) as {
      version: number;
      cases: unknown[];
    };
    expect(parsed.version).toBe(1);
    expect(parsed.cases.length).toBeGreaterThan(0);
  });
});
