import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/server/domain/errors/domain_error';
import {
  LIBRARY_MAX_BYTES,
  LIBRARY_MAX_FOLDER_DEPTH,
  bytesMatchFileKind,
  folderDepthAfterMove,
  isValidSha256,
  resolveFileType,
  reviewDueAt,
  sourceObjectKey,
  titleFromFileName,
  wouldCreateFolderCycle,
} from '@/server/domain/library/library';

const WS = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

describe('Library file type and size rules (FR-LIB-06)', () => {
  it('limits a file to 25 MB (OQ-LIB-5 default)', () => {
    expect(LIBRARY_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it.each([
    ['price list.pdf', 'application/pdf', 'pdf'],
    ['sop.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'ooxml'],
    ['stock.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'ooxml'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ooxml'],
    ['rows.csv', 'text/csv', 'text'],
    ['notes.txt', 'text/plain', 'text'],
    ['readme.md', 'text/markdown', 'text'],
    ['scan.JPG', 'image/jpeg', 'image'],
    ['scan.png', 'image/png', 'image'],
    ['scan.webp', 'image/webp', 'image'],
  ])('accepts %s as %s', (name, type, kind) => {
    expect(resolveFileType(name, type).kind).toBe(kind);
  });

  it.each([
    ['movie.mp4', 'video/mp4'],
    ['voice.mp3', 'audio/mpeg'],
    ['logo.svg', 'image/svg+xml'],
    ['archive.zip', 'application/zip'],
    ['macro.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12'],
    ['no_extension', 'application/pdf'],
    ['report.pdf', 'image/png'],
    ['report.pdf.exe', 'application/pdf'],
  ])('rejects %s declared as %s with a ValidationError', (name, type) => {
    expect(() => resolveFileType(name, type)).toThrow(ValidationError);
  });

  it('accepts the browser fallback type for markdown', () => {
    expect(resolveFileType('a.md', 'text/plain').kind).toBe('text');
  });
});

describe('Library magic bytes (the declared type is only a hint)', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n...');
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const text = new TextEncoder().encode('Harga: 10.000');

  it('recognises each kind', () => {
    expect(bytesMatchFileKind('pdf', pdf)).toBe(true);
    expect(bytesMatchFileKind('ooxml', zip)).toBe(true);
    expect(bytesMatchFileKind('image', png)).toBe(true);
    expect(bytesMatchFileKind('text', text)).toBe(true);
  });

  it('rejects a payload that is not what it says', () => {
    expect(bytesMatchFileKind('pdf', zip)).toBe(false);
    expect(bytesMatchFileKind('ooxml', pdf)).toBe(false);
    expect(bytesMatchFileKind('image', pdf)).toBe(false);
    expect(bytesMatchFileKind('text', Uint8Array.from([0x41, 0x00, 0x42]))).toBe(false);
    expect(bytesMatchFileKind('pdf', new Uint8Array())).toBe(false);
  });
});

describe('Library identifiers and keys', () => {
  it('builds the object key from validated UUIDs only', () => {
    expect(sourceObjectKey(WS, DOC)).toBe(`t/${WS}/library/${DOC}/source`);
    expect(() => sourceObjectKey('../etc', DOC)).toThrow(ValidationError);
    expect(() => sourceObjectKey(WS, '../../x')).toThrow(ValidationError);
  });

  it('accepts only a lowercase 64 character hex SHA-256', () => {
    expect(isValidSha256('a'.repeat(64))).toBe(true);
    expect(isValidSha256('A'.repeat(64))).toBe(false);
    expect(isValidSha256('a'.repeat(63))).toBe(false);
    expect(isValidSha256('g'.repeat(64))).toBe(false);
  });

  it('derives a title from the file name', () => {
    expect(titleFromFileName('Daftar Harga 2026.pdf')).toBe('Daftar Harga 2026');
    expect(titleFromFileName('.pdf')).toBe('.pdf');
    expect(titleFromFileName('x'.repeat(400) + '.pdf')).toHaveLength(200);
  });

  it('sets review_due_at from the review interval (FR-LIB-22)', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(reviewDueAt(from, 90)?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(reviewDueAt(from, null)).toBeNull();
  });
});

describe('Library folder rules (FR-LIB-04)', () => {
  const folders = [
    { id: 'a', parent_id: null },
    { id: 'b', parent_id: 'a' },
    { id: 'c', parent_id: 'b' },
    { id: 'x', parent_id: null },
  ];

  it('allows depth 3 and not 4', () => {
    expect(LIBRARY_MAX_FOLDER_DEPTH).toBe(3);
    // A new folder (no id moving) under null is depth 1, under b depth 3, under c depth 4.
    expect(folderDepthAfterMove(folders, null, null)).toBe(1);
    expect(folderDepthAfterMove(folders, 'b', null)).toBe(3);
    expect(folderDepthAfterMove(folders, 'c', null)).toBe(4);
  });

  it('counts the moved subtree height too', () => {
    // Moving a (height 3) under x (depth 1) puts c at depth 4 + 1 = 5; the deepest is 1 + 3.
    expect(folderDepthAfterMove(folders, 'x', 'a')).toBe(4);
    // Moving b (height 2) under x gives depth 3 for c.
    expect(folderDepthAfterMove(folders, 'x', 'b')).toBe(3);
  });

  it('detects a move into its own subtree', () => {
    expect(wouldCreateFolderCycle(folders, 'a', 'c')).toBe(true);
    expect(wouldCreateFolderCycle(folders, 'a', 'a')).toBe(true);
    expect(wouldCreateFolderCycle(folders, 'c', 'x')).toBe(false);
    expect(wouldCreateFolderCycle(folders, 'a', null)).toBe(false);
  });
});
