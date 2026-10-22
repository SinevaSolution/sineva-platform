import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// FR-DS-04 / FR-UX-05: each design rule has a violating file that must fail
// eslint with that rule, plus a clean file that must pass. The fixtures sit in
// lint_fixtures/, which the normal lint run ignores (they are broken on
// purpose) and this test lints with `ignore: false`.
const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES = resolve(import.meta.dirname, 'lint_fixtures');

const EXPECTED: Array<[fixture: string, ruleId: string]> = [
  ['raw_hex.tsx', 'sineva-design/no-raw-color'],
  ['raw_hex_class.tsx', 'sineva-design/no-raw-color'],
  ['raw_rgb.tsx', 'sineva-design/no-raw-color'],
  ['raw_rgb_template.tsx', 'sineva-design/no-raw-color'],
  ['raw_rgb_arbitrary.tsx', 'sineva-design/no-raw-color'],
  ['palette_class.tsx', 'sineva-design/no-raw-color'],
  ['arbitrary_primitive.tsx', 'sineva-design/no-raw-color'],
  ['accent_ramp_step.tsx', 'sineva-design/no-raw-color'],
  ['dark_variant.tsx', 'sineva-design/no-dark-variant'],
  ['arbitrary_z.tsx', 'sineva-design/no-arbitrary-z'],
  ['numeric_z.tsx', 'sineva-design/no-arbitrary-z'],
  ['physical_direction.tsx', 'sineva-design/no-physical-direction'],
  ['physical_position.tsx', 'sineva-design/no-physical-direction'],
  ['physical_corner.tsx', 'sineva-design/no-physical-direction'],
  ['motion_import.tsx', 'sineva-design/no-motion-import'],
  ['framer_motion_import.tsx', 'sineva-design/no-motion-import'],
  ['dangerous_html.tsx', 'sineva-design/no-dangerous-html'],
  ['server_import.tsx', 'no-restricted-imports'],
  ['web_app_import.tsx', 'no-restricted-imports'],
];

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: PACKAGE_ROOT, ignore: false });
});

async function ruleIdsOf(fixture: string): Promise<string[]> {
  const [result] = await eslint.lintFiles([resolve(FIXTURES, fixture)]);
  const fatal = result!.messages.filter((m) => m.fatal);
  expect(fatal.map((m) => m.message), `${fixture} must parse`).toEqual([]);
  return result!.messages.map((m) => m.ruleId ?? 'parse');
}

describe('packages/ui design lint rules (FR-DS-04)', () => {
  it.each(EXPECTED)('%s fails eslint with %s', async (fixture, ruleId) => {
    expect(await ruleIdsOf(fixture)).toContain(ruleId);
  });

  it('passes a file that uses only tokens, logical properties and token z-index', async () => {
    expect(await ruleIdsOf('clean.tsx')).toEqual([]);
  });
});
