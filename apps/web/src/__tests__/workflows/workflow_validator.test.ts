import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateWorkflowDefinition,
  type ValidationContext,
} from '@/shared/workflows/validate';

// FR-WF-03 to FR-WF-19 (WP-M3-05). The fixtures are shared with sineva-ai: both
// validators must report the same issue codes on every file.

const DIR = join(import.meta.dirname, 'fixtures');
interface Fixture {
  description: string;
  context: ValidationContext;
  definition: unknown;
  expected_codes: string[];
}
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const load = (file: string) => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Fixture;

describe('workflow validator on the shared fixtures', () => {
  it('has fixtures to run', () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it.each(FILES)('%s reports exactly the expected issue codes', (file) => {
    const fixture = load(file);
    const result = validateWorkflowDefinition(fixture.definition, fixture.context);
    const codes = [...new Set(result.issues.map((issue) => issue.code))].sort();
    expect(codes).toEqual([...fixture.expected_codes].sort());
    expect(result.ok).toBe(fixture.expected_codes.length === 0);
  });
});

describe('workflow validator details', () => {
  const run = (name: string) => {
    const fixture = load(`${name}.json`);
    return validateWorkflowDefinition(fixture.definition, fixture.context);
  };

  it('marks a specialist that is off and a missing connection as needs attention, and blocks', () => {
    for (const name of ['needs_attention_specialist_off', 'needs_attention_connection_missing', 'needs_attention_connection_off']) {
      const result = run(name);
      expect(result.ok).toBe(false);
      expect(result.issues.every((issue) => issue.needs_attention)).toBe(true);
    }
  });

  it('does not mark real mistakes as needs attention', () => {
    expect(run('invalid_nested_loop').issues.some((issue) => issue.needs_attention)).toBe(false);
  });

  it('points at the step and the field of an issue', () => {
    const [issue] = run('invalid_reference_missing').issues;
    expect(issue).toMatchObject({
      code: 'reference_missing_step',
      step_key: 'a',
      path: 'steps[0].instruction',
      params: { key: 'ghost' },
    });
  });

  it('reports the limit it enforces so the message can name it', () => {
    expect(run('invalid_too_many_steps').issues[0]?.params).toMatchObject({ max: 12 });
    expect(run('invalid_wait_too_long').issues[0]?.params).toMatchObject({ max_days: 7 });
  });

  it('never throws on garbage and reports it as a schema problem', () => {
    for (const garbage of [null, undefined, 7, 'x', [], { steps: 'nope' }, { schema_version: 1, steps: [null] }]) {
      expect(() => validateWorkflowDefinition(garbage, {})).not.toThrow();
      expect(validateWorkflowDefinition(garbage, {}).ok).toBe(false);
    }
  });

  it('skips the checks it has no facts for instead of guessing', () => {
    const fixture = load('needs_attention_specialist_off.json');
    const result = validateWorkflowDefinition(fixture.definition, { ...fixture.context, enabled_specialists: null });
    expect(result.ok).toBe(true);
  });
});
