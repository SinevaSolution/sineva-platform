import { DomainError, ValidationError } from '@/server/domain/errors/domain_error';

// Machine codes the Library UI maps to copy. The messages are for logs and
// developers; the UI never shows them (error copy maps from `code`).

/** An identical file already sits in a shared scope (FR-LIB-07, "Already in your Library"). */
export class AlreadyInLibraryError extends DomainError {
  constructor(existingDocumentId: string) {
    super({
      message: 'An identical document is already in your Library',
      code: 'already_in_library',
      status: 409,
      // The id lets the UI link to the existing document.
      details: [{ code: 'already_in_library', field: 'sha256', detail: existingDocumentId }],
    });
    this.name = 'AlreadyInLibraryError';
  }
}

export class FolderNotEmptyError extends DomainError {
  constructor(counts: { folders: number; documents: number }) {
    super({
      message: 'Move or delete what is inside the folder first',
      code: 'folder_not_empty',
      status: 409,
      details: [
        {
          code: 'folder_not_empty',
          field: null,
          detail: `folders=${counts.folders} documents=${counts.documents}`,
        },
      ],
    });
    this.name = 'FolderNotEmptyError';
  }
}

/** The request is fine but the document is in a state that does not allow it. */
export class LibraryStateError extends DomainError {
  constructor(code: 'preview_not_ready' | 'upload_not_found', message: string) {
    super({ message, code, status: 409 });
    this.name = 'LibraryStateError';
  }
}

export function libraryValidation(code: string, field: string, detail: string): ValidationError {
  return new ValidationError(detail, [{ code, field, detail }]);
}
