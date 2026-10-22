import type { ListSquadsQueryDto } from '@/server/application/dtos/squad_dto';
import {
  describeSquad,
  readRoster,
  requireWorkspace,
  type SquadDeps,
  type SquadDescription,
} from '@/server/application/squads/squad_support';
import type { RequestContext } from '@/server/domain/context/request_context';

export class ListSquadsUseCase {
  constructor(private readonly deps: Pick<SquadDeps, 'squads' | 'directory'>) {}

  async execute(query: ListSquadsQueryDto, context: RequestContext): Promise<{ items: SquadDescription[] }> {
    const squads = await this.deps.squads.list(requireWorkspace(context), { status: query.status });
    // One roster read for the whole list.
    const roster = await readRoster(this.deps.directory, context);
    const items = await Promise.all(squads.map((squad) => describeSquad(this.deps, squad, context, roster)));
    return { items };
  }
}
