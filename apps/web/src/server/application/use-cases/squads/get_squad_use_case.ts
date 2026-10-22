import {
  describeSquad,
  loadSquad,
  readRoster,
  type SquadDeps,
  type SquadDescription,
} from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';

export class GetSquadUseCase {
  constructor(private readonly deps: Pick<SquadDeps, 'squads' | 'directory'>) {}

  async execute(squadId: string, context: RequestContext): Promise<SquadDescription> {
    const squad = await loadSquad(this.deps, context, squadId);
    return describeSquad(this.deps, squad, context, await readRoster(this.deps.directory, context));
  }
}
