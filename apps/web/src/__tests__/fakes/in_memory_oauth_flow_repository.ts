import { randomUUID } from 'node:crypto';
import type { NewOAuthFlow, OAuthFlowEntity } from '@/server/domain/connections/oauth_flow';
import type { OAuthFlowRepository } from '@/server/domain/repositories/oauth_flow_repository';

export class InMemoryOAuthFlowRepository implements OAuthFlowRepository {
  readonly flows = new Map<string, OAuthFlowEntity>();
  consumeAttempts = 0;

  async create(input: NewOAuthFlow): Promise<OAuthFlowEntity> {
    const flow: OAuthFlowEntity = { ...input, id: randomUUID(), consumed_at: null, created_at: new Date() };
    this.flows.set(flow.id, flow);
    return { ...flow };
  }

  async consume(stateHash: string, now: Date): Promise<OAuthFlowEntity | null> {
    this.consumeAttempts += 1;
    const flow = [...this.flows.values()].find((candidate) => candidate.state_hash === stateHash);
    if (!flow || flow.consumed_at) return null;
    flow.consumed_at = now;
    return { ...flow };
  }

  async remove(id: string): Promise<void> {
    this.flows.delete(id);
  }

  /** Test helper: the single stored flow. */
  only(): OAuthFlowEntity {
    const all = [...this.flows.values()];
    if (all.length !== 1) throw new Error(`expected one flow, found ${all.length}`);
    return all[0]!;
  }
}
