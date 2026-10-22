import type {
  LibraryFolderView,
  LibraryScopeView,
  LibrarySourceTypeView,
  LibraryStatusView,
} from '@/shared/library_view';

// Pure helpers behind the Library page: what the person sees for a status,
// a file, an access list and a collection tree. No React, no fetching, so the
// rules are testable and the components stay thin.

/** What the Library calls a document's state. The wire has more words than a person needs. */
export type LibraryUiStatus = 'reading' | 'ready' | 'needs_look' | 'cant_read';

/**
 * Wire status to what the page says. `queued` and `processing` are both
 * "Reading": from the person's side the file was received and Sino is on it.
 * `deleting` is never listed (the API hides it); mapping it to Reading keeps
 * the function total without showing a word that means nothing to anyone.
 */
export function uiStatus(status: LibraryStatusView): LibraryUiStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'needs_attention':
      return 'needs_look';
    case 'failed':
      return 'cant_read';
    case 'queued':
    case 'processing':
    case 'deleting':
      return 'reading';
  }
}

export type LibraryFileKind = 'pdf' | 'word' | 'excel' | 'slides' | 'image' | 'text' | 'note';

export function fileKind(mimeType: string, sourceType: LibrarySourceTypeView): LibraryFileKind {
  // A note or a saved chat answer is text Sino was given, not a file someone made elsewhere.
  if (sourceType === 'note' || sourceType === 'chat_save') return 'note';
  const mime = mimeType.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('wordprocessingml')) return 'word';
  if (mime.includes('spreadsheetml') || mime === 'text/csv') return 'excel';
  if (mime.includes('presentationml')) return 'slides';
  if (mime.startsWith('image/')) return 'image';
  return 'text';
}

const EXTENSION_KINDS: Record<string, LibraryFileKind> = {
  pdf: 'pdf',
  docx: 'word',
  xlsx: 'excel',
  csv: 'excel',
  pptx: 'slides',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
};

/** The kind from a file name, for a file that has not reached the server yet (an upload card). */
export function fileKindFromName(fileName: string): LibraryFileKind {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return EXTENSION_KINDS[extension] ?? 'text';
}

export interface AccessChoice {
  everyone: boolean;
  specialists: string[];
  /** Squad ids (ADR-0043). */
  squads: string[];
}

/**
 * Who can use something. Everyone already includes every specialist, so a list
 * with both is just Everyone. The workflow scope is reserved and not shown
 * yet; a specialist or squad scope without a reference is ignored as broken data.
 */
export function accessSummary(scopes: readonly LibraryScopeView[]): AccessChoice {
  if (scopes.some((scope) => scope.scope_type === 'workspace')) {
    return { everyone: true, specialists: [], squads: [] };
  }
  const specialists = scopes.flatMap((scope) =>
    scope.scope_type === 'specialist' && scope.scope_ref ? [scope.scope_ref] : [],
  );
  const squads = scopes.flatMap((scope) => (scope.scope_type === 'squad' && scope.scope_ref ? [scope.scope_ref] : []));
  return { everyone: false, specialists: [...new Set(specialists)], squads: [...new Set(squads)] };
}

/** Same choice, whatever the order the lists came in. */
export function accessKey(choice: AccessChoice): string {
  return `${choice.everyone}:${choice.specialists.slice().sort().join(',')}:${choice.squads.slice().sort().join(',')}`;
}

export function sameAccess(a: AccessChoice, b: AccessChoice): boolean {
  return accessKey(a) === accessKey(b);
}

export type ScopeInput =
  | { scope_type: 'workspace' }
  | { scope_type: 'specialist'; scope_ref: string }
  | { scope_type: 'squad'; scope_ref: string };

/**
 * The request scopes for a choice. Null when nothing is chosen: an empty list
 * would mean nobody can use it, which the API refuses, so the form blocks
 * saving instead of sending it.
 */
export function scopeInputs(choice: AccessChoice): ScopeInput[] | null {
  if (choice.everyone) return [{ scope_type: 'workspace' }];
  if (choice.specialists.length === 0 && choice.squads.length === 0) return null;
  return [
    ...choice.specialists.map((scope_ref) => ({ scope_type: 'specialist' as const, scope_ref })),
    ...choice.squads.map((scope_ref) => ({ scope_type: 'squad' as const, scope_ref })),
  ];
}

export interface CollectionNode {
  id: string;
  name: string;
  parent_id: string | null;
  scopes: LibraryScopeView[];
  /** Documents directly in this collection. */
  count: number;
  /** 0 at the top. */
  depth: number;
  children: CollectionNode[];
}

/**
 * Nests the flat folder list. A collection whose parent is not in the list
 * (hidden from this member, or bad data) is shown at the top rather than lost.
 * Siblings are sorted by name. A cycle in bad data cannot loop: a node is
 * attached once, and the walk to the top is bounded.
 */
export function buildCollectionTree(
  folders: readonly LibraryFolderView[],
  counts: Readonly<Record<string, number>>,
): CollectionNode[] {
  const byId = new Map<string, CollectionNode>();
  for (const folder of folders) {
    byId.set(folder.id, {
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id,
      scopes: folder.scopes,
      count: counts[folder.id] ?? 0,
      depth: 0,
      children: [],
    });
  }
  const roots: CollectionNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && !reachesItself(byId, node)) parent.children.push(node);
    else roots.push(node);
  }
  const byName = (a: CollectionNode, b: CollectionNode) => a.name.localeCompare(b.name);
  const finish = (nodes: CollectionNode[], depth: number) => {
    nodes.sort(byName);
    for (const node of nodes) {
      node.depth = depth;
      finish(node.children, depth + 1);
    }
  };
  finish(roots, 0);
  return roots;
}

function reachesItself(byId: Map<string, CollectionNode>, start: CollectionNode): boolean {
  let cursor = start.parent_id ? byId.get(start.parent_id) : undefined;
  for (let hops = 0; cursor && hops <= byId.size; hops += 1) {
    if (cursor.id === start.id) return true;
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return false;
}

/** Depth first, parents before children: the order a picker lists collections in. */
export function flattenCollectionTree(nodes: readonly CollectionNode[]): CollectionNode[] {
  return nodes.flatMap((node) => [node, ...flattenCollectionTree(node.children)]);
}

/** Parent, grandparent and so on, so the tree can open down to the chosen collection. */
export function ancestorIds(folders: readonly LibraryFolderView[], id: string): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const found: string[] = [];
  let cursor = byId.get(id)?.parent_id ?? null;
  while (cursor && !found.includes(cursor) && found.length <= folders.length) {
    found.push(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return found;
}

/** The member's name for an uploader id, or null: the page never invents a name. */
export function uploadedByName(names: Readonly<Record<string, string>>, userId: string): string | null {
  return names[userId] ?? null;
}
