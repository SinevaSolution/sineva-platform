// Structural rules every card schema must follow (FR-AX-08). They run when a
// registry is built, so a schema that breaks them fails at import time in
// tests and in the build instead of shipping.
//
// The accepted JSON Schema subset is deliberately small. The typed-string
// checks in `typed_strings.ts` walk the schema and the data side by side, which
// is only sound when the schema has one shape per property. `oneOf`, `anyOf`,
// `allOf`, `if` and friends would make that walk ambiguous, and a card that
// needs them is a sign the type should be split in two.

export const KNOWN_ANNOTATIONS = [
  'x-streamable',
  'x-editable',
  'x-pii',
  'x-origin',
  'x-ttl',
  // Typed string kinds. Exactly one of these (or none, meaning plain text).
  'x-link',
  'x-contact',
  'x-media-ref',
  // Strip bidi and zero-width characters before validation (names, subjects, addresses).
  'x-sanitize',
] as const;

const UNSUPPORTED_KEYWORDS = [
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'patternProperties',
  'additionalItems',
  'unevaluatedProperties',
  'unevaluatedItems',
  '$dynamicRef',
  '$dynamicAnchor',
  '$anchor',
  '$data',
] as const;

type Schema = Record<string, unknown>;

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function lintSchema(schema: Schema, label: string): void {
  visit(schema, label, '#');
}

function visit(node: Schema, label: string, path: string): void {
  const fail = (message: string): never => {
    throw new Error(`card schema ${label} at ${path}: ${message}`);
  };

  for (const key of Object.keys(node)) {
    if (key.startsWith('x-') && !(KNOWN_ANNOTATIONS as readonly string[]).includes(key)) {
      fail(`unknown annotation ${key}`);
    }
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) {
      fail(`keyword ${key} is not supported by the card schema subset`);
    }
  }

  const origin = node['x-origin'];
  if (origin !== undefined && origin !== 'source' && origin !== 'model') {
    fail(`x-origin must be "source" or "model"`);
  }

  const ref = node['$ref'];
  if (ref !== undefined) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) {
      fail(`$ref must be a local pointer starting with #/`);
    }
    return;
  }

  const kinds = ['x-link', 'x-contact', 'x-media-ref'].filter((key) => node[key] === true);
  if (kinds.length > 1) fail(`only one of x-link, x-contact, x-media-ref per field`);

  const type = node['type'];
  if (type === 'string') {
    if (node['enum'] === undefined && node['const'] === undefined && typeof node['maxLength'] !== 'number') {
      fail(`string needs maxLength`);
    }
  } else if (type === 'array') {
    if (typeof node['maxItems'] !== 'number') fail(`array needs maxItems`);
    if (!isSchema(node['items'])) fail(`array needs an items schema`);
    visit(node['items'] as Schema, label, `${path}/items`);
  } else if (type === 'object') {
    if (node['additionalProperties'] !== false) fail(`object needs additionalProperties: false`);
    const properties = node['properties'];
    if (properties !== undefined) {
      if (!isSchema(properties)) fail(`properties must be an object`);
      for (const [name, child] of Object.entries(properties as Schema)) {
        if (!isSchema(child)) fail(`property ${name} must be a schema`);
        visit(child as Schema, label, `${path}/properties/${name}`);
      }
    }
  }

  const defs = node['$defs'];
  if (isSchema(defs)) {
    for (const [name, child] of Object.entries(defs)) {
      if (isSchema(child)) visit(child, label, `${path}/$defs/${name}`);
    }
  }
}
