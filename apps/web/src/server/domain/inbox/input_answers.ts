import type { InputField } from './inbox_item';

const MAX_TEXT = 2_000;

export type AnswerCheck = { ok: true } | { ok: false; field: string };

/**
 * Checks answers against the form the specialist asked for: no unknown keys,
 * every required field present, each value of the field's type, a choice
 * among the offered ones. Answers are user content, so only the failing
 * field name leaves this function.
 */
export function validateAnswers(fields: readonly InputField[], answers: Record<string, unknown>): AnswerCheck {
  const known = new Map(fields.map((f) => [f.key, f]));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) return { ok: false, field: key };
  }
  for (const field of fields) {
    const value = answers[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required) return { ok: false, field: field.key };
      continue;
    }
    switch (field.type) {
      case 'text':
        if (typeof value !== 'string' || value.length > MAX_TEXT) return { ok: false, field: field.key };
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return { ok: false, field: field.key };
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, field: field.key };
        break;
      case 'choice':
        if (typeof value !== 'string' || !(field.choices ?? []).includes(value)) {
          return { ok: false, field: field.key };
        }
        break;
    }
  }
  return { ok: true };
}
