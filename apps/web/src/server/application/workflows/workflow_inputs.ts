import { ValidationError } from '@/server/domain/errors/domain_error';
import type { WorkflowDefinition, WorkflowInput } from '@/shared/workflows/definition';

// Turns what a person typed into the start form into the inputs of a run:
// defaults filled, each value checked against its declared type. Every problem
// is reported at once with the field that failed, so the form can mark them.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILES = 25;

type Problem = { code: 'input_required' | 'input_invalid' | 'unknown_input'; field: string };

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
}

function coerce(input: WorkflowInput, value: unknown): { ok: true; value: unknown } | { ok: false } {
  switch (input.type) {
    case 'text':
      return typeof value === 'string' ? { ok: true, value: value.trim() } : { ok: false };
    case 'number': {
      const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN;
      return Number.isFinite(number) ? { ok: true, value: number } : { ok: false };
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false };
      return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? { ok: false } : { ok: true, value };
    }
    case 'choice':
      return typeof value === 'string' && (input.options ?? []).includes(value) ? { ok: true, value } : { ok: false };
    case 'library_file': {
      if (input.multiple) {
        const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
        const valid = list && list.length <= MAX_FILES && list.every((id) => typeof id === 'string' && UUID.test(id));
        return valid ? { ok: true, value: list } : { ok: false };
      }
      return typeof value === 'string' && UUID.test(value) ? { ok: true, value } : { ok: false };
    }
  }
}

export function resolveRunInputs(definition: WorkflowDefinition, given: Record<string, unknown>): Record<string, unknown> {
  const declared = new Map(definition.inputs.map((input) => [input.key, input]));
  const problems: Problem[] = [];
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(given)) {
    if (!declared.has(key)) problems.push({ code: 'unknown_input', field: `inputs.${key}` });
  }
  for (const input of definition.inputs) {
    const value = given[input.key];
    if (isBlank(value)) {
      if (input.default !== undefined && input.default !== null && input.default !== '') {
        result[input.key] = input.default;
      } else if (input.required) {
        problems.push({ code: 'input_required', field: `inputs.${input.key}` });
      }
      continue;
    }
    const coerced = coerce(input, value);
    if (coerced.ok) result[input.key] = coerced.value;
    else problems.push({ code: 'input_invalid', field: `inputs.${input.key}` });
  }

  if (problems.length > 0) {
    throw new ValidationError(
      'Some inputs are missing or not valid',
      problems.map((problem) => ({ code: problem.code, field: problem.field, detail: problem.field })),
    );
  }
  return result;
}
