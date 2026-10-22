import type { ZodTypeAny } from 'zod';
import type {
  ActionDefinition,
  AssignableSideEffect,
  LocalizedText,
} from '@/server/domain/connections/connector';

export const loc = (en: string, id: string): LocalizedText => ({ en, id });

const DEFAULT_RESPONSE_BYTES = 256 * 1024;

interface ActionInput {
  action_id: string;
  provider_id: string;
  side_effect: AssignableSideEffect;
  scopes: string[];
  input_schema: ZodTypeAny;
  output_schema: ZodTypeAny;
  sentence: LocalizedText;
  risk_level?: ActionDefinition['risk_level'];
  reversible?: boolean;
  display_card_type?: string | null;
  max_response_bytes?: number;
}

/**
 * Builds an action with the safe defaults: a read is low risk, reversible by
 * nature and eligible for autonomy; anything that changes the outside world is
 * medium risk, never autonomy eligible and never guardrail locked unless the
 * manifest says so. `pay` is not accepted: the parameter type excludes it.
 */
export function defineAction(input: ActionInput): ActionDefinition {
  const isRead = input.side_effect === 'read';
  return {
    action_id: input.action_id,
    provider_id: input.provider_id,
    side_effect: input.side_effect,
    scopes: input.scopes,
    risk_level: input.risk_level ?? (isRead ? 'low' : 'medium'),
    reversible: input.reversible ?? isRead,
    autonomy_eligible: isRead,
    guardrail_locked: false,
    approval_sentence_template: input.sentence,
    input_schema: input.input_schema,
    output_schema: input.output_schema,
    display_card_type: input.display_card_type ?? null,
    activity_label_key: `connections.activity.${input.action_id}`,
    max_response_bytes: input.max_response_bytes ?? DEFAULT_RESPONSE_BYTES,
  };
}
