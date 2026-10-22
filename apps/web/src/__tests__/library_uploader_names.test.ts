import { describe, expect, it } from 'vitest';
import { GetLibraryUploaderNamesUseCase } from '@/server/application/use-cases/library/get_library_uploader_names_use_case';
import type { MemberDirectoryEntry } from '@/server/domain/repositories/workspace_member_repository';
import { OTHER_WS, USER, WS, ctx } from './library_harness';

const entry = (userId: string, full: string, preferred: string | null = null): MemberDirectoryEntry =>
  ({
    member: { id: `member-${userId}`, user_id: userId },
    user: { full_name: full, preferred_name: preferred, email: `${userId}@sineva.id` },
  }) as unknown as MemberDirectoryEntry;

function useCase(directory: Record<string, MemberDirectoryEntry[]>) {
  const asked: string[] = [];
  const members = {
    listDirectory: async (workspaceId: string) => {
      asked.push(workspaceId);
      return directory[workspaceId] ?? [];
    },
  };
  return { asked, run: new GetLibraryUploaderNamesUseCase({ members: members as never }) };
}

describe('names for "Uploaded by"', () => {
  it('maps the asked user ids to the preferred or full name of members of this workspace only', async () => {
    const { run, asked } = useCase({
      [WS]: [entry(USER, 'Sari Wulandari', 'Sari'), entry('u-2', 'Budi Santoso'), entry('u-3', 'Not asked')],
      [OTHER_WS]: [entry('u-9', 'Other Tenant')],
    });
    const names = await run.execute([USER, 'u-2', 'u-9', 'u-gone'], ctx());
    expect(names).toEqual({ [USER]: 'Sari', 'u-2': 'Budi Santoso' });
    // The directory of another workspace is never read.
    expect(asked).toEqual([WS]);
  });

  it('does not read the directory when nobody is asked for', async () => {
    const { run, asked } = useCase({ [WS]: [entry(USER, 'Sari')] });
    expect(await run.execute([], ctx())).toEqual({});
    expect(asked).toEqual([]);
  });

  it('leaves out a person who left, instead of inventing a name', async () => {
    const { run } = useCase({ [WS]: [] });
    expect(await run.execute([USER], ctx())).toEqual({});
  });
});
