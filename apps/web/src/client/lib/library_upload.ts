import { ApiError, apiRequest } from './api';
import type { LibraryDocumentView, LibraryUploadTicketView } from '@/shared/library_view';
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export async function uploadLibraryFile(
  workspaceId: string,
  file: File,
  options: {
    folder_id?: string | null;
    scopes?: Array<{ scope_type: 'workspace' | 'specialist'; scope_ref?: string }>;
  } = {},
): Promise<LibraryDocumentView> {
  if (file.size < 1 || file.size > 25 * 1024 * 1024)
    throw new ApiError('Invalid file size', 422, 'validation_failed');
  const contentType = CONTENT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!contentType) throw new ApiError('Unsupported file type', 422, 'validation_failed');
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const base = `/api/v1/workspaces/${workspaceId}/library`;
  const ticket = await apiRequest<LibraryUploadTicketView>(`${base}/uploads`, {
    method: 'POST',
    body: {
      file_name: file.name,
      content_type: contentType,
      byte_size: file.size,
      sha256,
      ...options,
    },
  });
  try {
    const result = await fetch(ticket.upload_url, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
      credentials: 'omit',
    });
    if (!result.ok) throw new Error('Storage upload failed');
  } catch {
    throw new ApiError('Storage upload failed', 0, 'network', ['upload_failed']);
  }
  return apiRequest<LibraryDocumentView>(`${base}/documents/${ticket.document_id}/complete`, {
    method: 'POST',
  });
}
