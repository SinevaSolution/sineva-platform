import guardrailNoticeV1 from '../schemas/guardrail_notice/v1.json';
import { createCardRegistry, type CardSchemaEntry, type CardUpcaster } from './registry';

export * from './registry';

export const PRODUCTION_SCHEMAS: CardSchemaEntry[] = [
  { card_type: 'guardrail_notice', version: 1, schema: guardrailNoticeV1 },
];
export const PRODUCTION_UPCASTERS: CardUpcaster[] = [];

export const cardRegistry = createCardRegistry({
  schemas: PRODUCTION_SCHEMAS,
  upcasters: PRODUCTION_UPCASTERS,
});
export type * from './generated/card_types';
