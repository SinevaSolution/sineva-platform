import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CardSchemaEntry } from './registry';

const TEST_SCHEMAS = join(import.meta.dirname, '..', 'test_schemas');

function load(cardType: string, version: number): CardSchemaEntry {
  const raw = readFileSync(join(TEST_SCHEMAS, cardType, `v${version}.json`), 'utf8');
  return { card_type: cardType, version, schema: JSON.parse(raw) as Record<string, unknown> };
}

/** The test-only schemas (never in the production registry), v1 and v2. */
export const TEST_ONLY_SCHEMAS: CardSchemaEntry[] = [load('test_only_card', 1), load('test_only_card', 2)];
