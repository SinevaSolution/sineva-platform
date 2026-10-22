import { FallbackCard } from './fallback_card';
import type { CardComponent } from './types';

/**
 * Static map from `(card_type, major version)` to a component (FR-AX-10).
 *
 * It is a plain object written in source, never built from data and never
 * loaded with a dynamic import: a card type that arrives in a message can
 * only select one of the components listed here, and an unknown type gets the
 * fallback renderer. Keys are `${card_type}@${major}`.
 */
export const CARD_RENDERERS: Readonly<Record<string, CardComponent>> = Object.freeze({
  // Every shipped type renders through the fallback until its own card ships.
  'guardrail_notice@1': FallbackCard,
});

/** Number of the major version of a stored `schema_version`. */
export function cardKey(cardType: string, schemaVersion: number): string {
  return `${cardType}@${Math.trunc(schemaVersion)}`;
}

export function resolveCardRenderer(
  cardType: string,
  schemaVersion: number,
  renderers: Readonly<Record<string, CardComponent>> = CARD_RENDERERS,
): CardComponent {
  // `Object.hasOwn`: a card type named `__proto__` or `constructor` must not
  // resolve to something inherited from Object.prototype.
  const key = cardKey(cardType, schemaVersion);
  return Object.hasOwn(renderers, key) ? (renderers[key] as CardComponent) : FallbackCard;
}
