import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_SCHEMAS } from './index';

const PLATFORM_SCHEMAS = join(import.meta.dirname, '..', 'schemas');
// <repo>/packages/card-schemas/src -> repo root is three levels up.
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SINEVA_AI_COPY =
  process.env.SINEVA_AI_CARD_SCHEMAS ??
  resolve(REPO_ROOT, '..', 'sineva-ai', 'tests', 'contract', 'fixtures', 'card_schemas');

const copyExists = existsSync(SINEVA_AI_COPY);

function schemaFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(root, dir.name))
        .filter((file) => /^v\d+\.json$/.test(file))
        .map((file) => `${dir.name}/${file}`),
    )
    .sort();
}

describe('card schemas drift against sineva-ai (ADR-0004 pattern)', () => {
  // The skip reason lives in the test title because vitest does not print
  // skip reasons: a green run must not read as "compared and identical".
  it.skipIf(!copyExists)(
    copyExists
      ? 'every schema file is byte-identical to the sineva-ai copy, and neither side has extra files'
      : `SKIPPED: no sineva-ai copy at ${SINEVA_AI_COPY} (sineva-ai must copy schemas/{card_type}/v{n}.json byte for byte)`,
    () => {
      const platform = schemaFiles(PLATFORM_SCHEMAS);
      const upstream = schemaFiles(SINEVA_AI_COPY);
      expect(upstream).toEqual(platform);
      for (const file of platform) {
        const a = readFileSync(join(PLATFORM_SCHEMAS, file));
        const b = readFileSync(join(SINEVA_AI_COPY, file));
        expect(a.equals(b), file).toBe(true);
      }
    },
  );

  it('every schema file on disk is registered, and nothing is registered without a file', () => {
    const onDisk = schemaFiles(PLATFORM_SCHEMAS);
    const registered = PRODUCTION_SCHEMAS.map((s) => `${s.card_type}/v${s.version}.json`).sort();
    expect(registered).toEqual(onDisk);
    expect(onDisk).toContain('guardrail_notice/v1.json');
  });

  it('keeps the test-only schema out of the production registry and the drift set', () => {
    expect(PRODUCTION_SCHEMAS.some((s) => s.card_type === 'test_only_card')).toBe(false);
    expect(schemaFiles(PLATFORM_SCHEMAS).some((f) => f.startsWith('test_only_card'))).toBe(false);
  });
});
