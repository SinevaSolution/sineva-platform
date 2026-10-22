import { describe, expect, it } from 'vitest';
import { formatFileSize } from '@sineva/ui/format';
import {
  accessSummary,
  ancestorIds,
  buildCollectionTree,
  fileKind,
  fileKindFromName,
  flattenCollectionTree,
  scopeInputs,
  uiStatus,
  uploadedByName,
} from '@/client/components/library/library_model';
import type { LibraryFolderView, LibraryScopeView } from '@/shared/library_view';

const folder = (id: string, name: string, parent_id: string | null = null): LibraryFolderView => ({
  id,
  parent_id,
  name,
  scopes: [{ scope_type: 'workspace', scope_ref: null }],
  created_at: '2026-10-22T00:00:00Z',
  updated_at: '2026-10-22T00:00:00Z',
});

describe('formatFileSize: human units only, never raw bytes', () => {
  it.each([
    [0, 'en', '0 KB'],
    [1, 'en', '1 KB'],
    [900, 'en', '1 KB'],
    [1024, 'en', '1 KB'],
    [1536, 'en', '1.5 KB'],
    [250 * 1024, 'en', '250 KB'],
    [3 * 1024 * 1024, 'en', '3 MB'],
    [3.5 * 1024 * 1024, 'en', '3.5 MB'],
    [25 * 1024 * 1024, 'en', '25 MB'],
    [2.25 * 1024 * 1024 * 1024, 'en', '2.3 GB'],
  ])('%s bytes in %s is %s', (bytes, locale, text) => {
    expect(formatFileSize(bytes, locale)).toBe(text);
  });

  it('uses the Indonesian decimal comma', () => {
    expect(formatFileSize(1.5 * 1024 * 1024, 'id')).toBe('1,5 MB');
  });
});

describe('plain-language status (never queued, processing, indexed)', () => {
  it.each([
    ['queued', 'reading'],
    ['processing', 'reading'],
    ['ready', 'ready'],
    ['needs_attention', 'needs_look'],
    ['failed', 'cant_read'],
  ] as const)('%s is shown as %s', (status, shown) => {
    expect(uiStatus(status)).toBe(shown);
  });

  it('never shows a document that is being deleted as something else than reading', () => {
    expect(uiStatus('deleting')).toBe('reading');
  });
});

describe('file kinds', () => {
  it.each([
    ['application/pdf', 'upload', 'pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'upload', 'word'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'upload', 'excel'],
    ['text/csv', 'upload', 'excel'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'upload', 'slides'],
    ['image/png', 'upload', 'image'],
    ['image/jpeg', 'upload', 'image'],
    ['text/plain', 'upload', 'text'],
    ['text/markdown', 'upload', 'text'],
    ['text/markdown', 'note', 'note'],
    ['text/markdown', 'chat_save', 'note'],
    ['application/x-unknown', 'upload', 'text'],
  ] as const)('%s from %s is %s', (mime, source, kind) => {
    expect(fileKind(mime, source)).toBe(kind);
  });
});

describe('file kind from a name', () => {
  it.each([
    ['Price List.PDF', 'pdf'],
    ['sop.docx', 'word'],
    ['stock.xlsx', 'excel'],
    ['stock.csv', 'excel'],
    ['deck.pptx', 'slides'],
    ['menu.jpeg', 'image'],
    ['faq.md', 'text'],
    ['no-extension', 'text'],
  ])('%s is %s', (name, kind) => {
    expect(fileKindFromName(name)).toBe(kind);
  });
});

describe('who can use a document or collection', () => {
  const everyone: LibraryScopeView = { scope_type: 'workspace', scope_ref: null };
  const only = (slug: string): LibraryScopeView => ({ scope_type: 'specialist', scope_ref: slug });

  it('summarises Everyone, chosen specialists, or both (Everyone wins)', () => {
    expect(accessSummary([everyone])).toEqual({ everyone: true, specialists: [] });
    expect(accessSummary([only('sinosales'), only('sinohelp')])).toEqual({
      everyone: false,
      specialists: ['sinosales', 'sinohelp'],
    });
    expect(accessSummary([everyone, only('sinosales')])).toEqual({ everyone: true, specialists: [] });
  });

  it('ignores reserved scope types and a specialist without a reference', () => {
    expect(
      accessSummary([
        { scope_type: 'squad', scope_ref: 's1' },
        { scope_type: 'workflow', scope_ref: 'w1' },
        { scope_type: 'specialist', scope_ref: null },
      ]),
    ).toEqual({ everyone: false, specialists: [] });
  });

  it('turns a choice back into request scopes, only ever workspace or specialist', () => {
    expect(scopeInputs({ everyone: true, specialists: ['sinosales'] })).toEqual([{ scope_type: 'workspace' }]);
    expect(scopeInputs({ everyone: false, specialists: ['sinosales', 'sinohelp'] })).toEqual([
      { scope_type: 'specialist', scope_ref: 'sinosales' },
      { scope_type: 'specialist', scope_ref: 'sinohelp' },
    ]);
  });

  it('refuses to produce an empty scope list: nothing chosen means nobody could use it', () => {
    expect(scopeInputs({ everyone: false, specialists: [] })).toBeNull();
  });
});

describe('collection tree', () => {
  const folders = [folder('a', 'Sales'), folder('b', 'Pricing', 'a'), folder('c', '2026', 'b'), folder('d', 'HR'), folder('x', 'Orphan', 'gone')];

  it('nests by parent, sorts by name, counts documents and treats an unknown parent as the top', () => {
    const tree = buildCollectionTree(folders, { a: 2, c: 5, d: 1 });
    expect(tree.map((n) => n.name)).toEqual(['HR', 'Orphan', 'Sales']);
    const sales = tree.find((n) => n.id === 'a')!;
    expect(sales.count).toBe(2);
    expect(sales.children.map((n) => n.name)).toEqual(['Pricing']);
    expect(sales.children[0]!.children[0]).toMatchObject({ name: '2026', count: 5, depth: 2 });
  });

  it('flattens depth first for pickers, with the depth for indentation', () => {
    const flat = flattenCollectionTree(buildCollectionTree(folders, {}));
    expect(flat.map((n) => `${'-'.repeat(n.depth)}${n.name}`)).toEqual(['HR', 'Orphan', 'Sales', '-Pricing', '--2026']);
  });

  it('lists the ancestors of a collection so the tree can open down to it', () => {
    expect(ancestorIds(folders, 'c')).toEqual(['b', 'a']);
    expect(ancestorIds(folders, 'a')).toEqual([]);
    expect(ancestorIds(folders, 'nope')).toEqual([]);
  });

  it('survives a cycle in bad data', () => {
    const cyclic = [folder('p', 'P', 'q'), folder('q', 'Q', 'p')];
    expect(ancestorIds(cyclic, 'p').length).toBeLessThanOrEqual(2);
    expect(() => buildCollectionTree(cyclic, {})).not.toThrow();
  });
});

describe('uploaded by', () => {
  it('uses the member name when known and nothing invented otherwise', () => {
    expect(uploadedByName({ 'u-1': 'Sari' }, 'u-1')).toBe('Sari');
    expect(uploadedByName({ 'u-1': 'Sari' }, 'u-2')).toBeNull();
  });
});
