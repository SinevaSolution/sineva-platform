import { describe, expect, it } from 'vitest';
import { CreateLibraryFolderUseCase } from '@/server/application/use-cases/library/create_library_folder_use_case';
import { DeleteLibraryFolderUseCase } from '@/server/application/use-cases/library/delete_library_folder_use_case';
import { ListLibraryFoldersUseCase } from '@/server/application/use-cases/library/list_library_folders_use_case';
import { UpdateLibraryFolderUseCase } from '@/server/application/use-cases/library/update_library_folder_use_case';
import { ConflictError, NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import { FolderNotEmptyError } from '@/server/domain/library/library_errors';
import { OTHER_USER, OTHER_WS, USER, WS, buildHarness, ctx, uploadAndComplete } from './library_harness';

function usecases(h: ReturnType<typeof buildHarness>) {
  return {
    create: new CreateLibraryFolderUseCase(h.deps),
    update: new UpdateLibraryFolderUseCase(h.deps),
    remove: new DeleteLibraryFolderUseCase(h.deps),
    list: new ListLibraryFoldersUseCase(h.deps),
  };
}

describe('folders (FR-LIB-04)', () => {
  it('creates folders up to depth 3 and refuses a fourth level', async () => {
    const h = buildHarness();
    const { create } = usecases(h);
    const one = await create.execute({ name: 'SOP' }, ctx());
    const two = await create.execute({ name: 'HR', parent_id: one.id }, ctx());
    const three = await create.execute({ name: '2026', parent_id: two.id }, ctx());
    const error = await create.execute({ name: 'Too deep', parent_id: three.id }, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details[0]?.code).toBe('folder_depth_exceeded');
  });

  it('keeps names unique per parent, at the root too, but allows the same name under another parent', async () => {
    const h = buildHarness();
    const { create } = usecases(h);
    const a = await create.execute({ name: 'SOP' }, ctx());
    await expect(create.execute({ name: 'SOP' }, ctx())).rejects.toBeInstanceOf(ConflictError);
    await expect(create.execute({ name: 'Notes', parent_id: a.id }, ctx())).resolves.toBeDefined();
    await expect(create.execute({ name: 'Notes' }, ctx())).resolves.toBeDefined();
    await expect(create.execute({ name: 'Notes', parent_id: a.id }, ctx())).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not accept a parent folder of another workspace', async () => {
    const h = buildHarness();
    const foreign = await h.folders.create({ workspace_id: OTHER_WS, parent_id: null, name: 'Theirs', created_by: OTHER_USER });
    await expect(usecases(h).create.execute({ name: 'x', parent_id: foreign.id }, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists only the folders of the caller workspace', async () => {
    const h = buildHarness();
    await h.folders.create({ workspace_id: OTHER_WS, parent_id: null, name: 'Theirs', created_by: OTHER_USER });
    const mine = await usecases(h).create.execute({ name: 'Mine' }, ctx());
    const list = await usecases(h).list.execute(ctx());
    expect(list.items.map((f) => f.id)).toEqual([mine.id]);
  });

  it('renames, and refuses a rename onto a sibling name', async () => {
    const h = buildHarness();
    const { create, update } = usecases(h);
    const a = await create.execute({ name: 'A' }, ctx());
    await create.execute({ name: 'B' }, ctx());
    await expect(update.execute(a.id, { name: 'Alpha' }, ctx())).resolves.toMatchObject({ name: 'Alpha' });
    await expect(update.execute(a.id, { name: 'B' }, ctx())).rejects.toBeInstanceOf(ConflictError);
  });

  it('moves a folder, and refuses a move into its own subtree or past depth 3', async () => {
    const h = buildHarness();
    const { create, update } = usecases(h);
    const a = await create.execute({ name: 'A' }, ctx());
    const b = await create.execute({ name: 'B', parent_id: a.id }, ctx());
    const c = await create.execute({ name: 'C', parent_id: b.id }, ctx());
    const x = await create.execute({ name: 'X' }, ctx());

    const cycle = await update.execute(a.id, { parent_id: c.id }, ctx()).catch((e: unknown) => e);
    expect((cycle as ValidationError).details[0]?.code).toBe('folder_cycle');

    // a (height 3) under x would reach level 4.
    const deep = await update.execute(a.id, { parent_id: x.id }, ctx()).catch((e: unknown) => e);
    expect((deep as ValidationError).details[0]?.code).toBe('folder_depth_exceeded');

    await expect(update.execute(c.id, { parent_id: x.id }, ctx())).resolves.toMatchObject({ parent_id: x.id });
    await expect(update.execute(c.id, { parent_id: null }, ctx())).resolves.toMatchObject({ parent_id: null });
  });

  it('404s a folder of another workspace', async () => {
    const h = buildHarness();
    const foreign = await h.folders.create({ workspace_id: OTHER_WS, parent_id: null, name: 'Theirs', created_by: OTHER_USER });
    await expect(usecases(h).update.execute(foreign.id, { name: 'x' }, ctx())).rejects.toBeInstanceOf(NotFoundError);
    await expect(usecases(h).remove.execute(foreign.id, ctx())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to delete a folder with folders inside, without cascading', async () => {
    const h = buildHarness();
    const { create, remove } = usecases(h);
    const a = await create.execute({ name: 'A' }, ctx());
    await create.execute({ name: 'B', parent_id: a.id }, ctx());
    const error = await remove.execute(a.id, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FolderNotEmptyError);
    expect((error as FolderNotEmptyError).status).toBe(409);
    expect(h.folders.rows.size).toBe(2);
  });

  it('refuses to delete a folder with documents inside, and deletes it once they moved out', async () => {
    const h = buildHarness();
    const { create, remove } = usecases(h);
    const folder = await create.execute({ name: 'Docs' }, ctx());
    const doc = await uploadAndComplete(h, { dto: { folder_id: folder.id } });
    await expect(remove.execute(folder.id, ctx())).rejects.toBeInstanceOf(FolderNotEmptyError);
    expect(h.documents.rows.get(doc.id)?.folder_id).toBe(folder.id);

    await h.documents.update(WS, doc.id, { folder_id: null });
    await expect(remove.execute(folder.id, ctx())).resolves.toEqual({ id: folder.id, deleted: true });
    expect(h.folders.rows.size).toBe(0);
  });

  it('records who created the folder from the session', async () => {
    const h = buildHarness();
    const folder = await usecases(h).create.execute({ name: 'A' }, ctx());
    expect(folder.created_by).toBe(USER);
  });
});
