import { requireWorkspace } from '@/server/application/library/library_support';
import { displayName } from '@/server/application/use-cases/members/member_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { WorkspaceMemberRepository } from '@/server/domain/repositories/workspace_member_repository';

/**
 * Names for the "Uploaded by" line of a document. Only members of the caller's
 * workspace are looked at, and only the asked-for ids come back, so the answer
 * is no wider than the document list that produced the ids. Someone who has
 * left the workspace is simply absent: the page then shows the date alone
 * rather than a name it cannot vouch for. Names are visible to every member
 * already (the members list shows them).
 */
export class GetLibraryUploaderNamesUseCase {
  constructor(private readonly deps: { members: Pick<WorkspaceMemberRepository, 'listDirectory'> }) {}

  async execute(userIds: readonly string[], context: RequestContext): Promise<Record<string, string>> {
    const wanted = new Set(userIds);
    if (wanted.size === 0) {
      return {};
    }
    const directory = await this.deps.members.listDirectory(requireWorkspace(context));
    const names: Record<string, string> = {};
    for (const { member, user } of directory) {
      if (wanted.has(member.user_id)) {
        names[member.user_id] = displayName(user);
      }
    }
    return names;
  }
}
