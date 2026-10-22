import type { NewOAuthFlow, OAuthFlowEntity } from '@/server/domain/connections/oauth_flow';

export interface OAuthFlowRepository {
  create(input: NewOAuthFlow): Promise<OAuthFlowEntity>;
  /**
   * Marks the flow with this state hash consumed and returns it, in one atomic
   * conditional update. Null when no such flow exists or it was already
   * consumed, so a replayed callback and a guessed state look the same.
   */
  consume(stateHash: string, now: Date): Promise<OAuthFlowEntity | null>;
  /** Removes a flow whose start failed before the person was sent anywhere. */
  remove(id: string): Promise<void>;
}
