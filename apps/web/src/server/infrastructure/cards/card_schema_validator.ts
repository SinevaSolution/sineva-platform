import 'server-only';
import { cardRegistry, type CardRegistry } from '@sineva/card-schemas';
import type { CardCheck, CardValidator } from '@/server/domain/chat/card_validator';

/** Adapter from the card registry package to the relay's `CardValidator` port. */
export class CardSchemaValidator implements CardValidator {
  constructor(private readonly registry: CardRegistry = cardRegistry) {}

  validate(display: unknown): CardCheck {
    return this.registry.validateDisplay(display);
  }

  supports(cardType: string, schemaVersion: unknown): boolean {
    return this.registry.supportsVersion(cardType, schemaVersion);
  }
}
