import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES } from '@/shared/avatar_limits';
import type { AvatarUploadTicketView, ProfileView } from '@/shared/profile_view';
import { ApiError, apiRequest } from './api';

/**
 * Early refusal of a file the server will certainly refuse, so the person gets
 * an answer without an upload. The declared type is only a hint; the server
 * decides from the bytes. Returns an error code that `apiErrorKey` understands.
 */
export function avatarFileProblem(file: File): 'unsupported_image' | 'image_too_large' | null {
  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type) || file.size === 0) {
    return 'unsupported_image';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'image_too_large';
  }
  return null;
}

/**
 * Three steps: get a presigned PUT, send the file straight to storage, then
 * ask the server to check and re-encode it. The browser never writes the final
 * object, so what ends up served is always the server's re-encode.
 */
export async function uploadAvatar(file: File): Promise<ProfileView> {
  const problem = avatarFileProblem(file);
  if (problem) {
    throw new ApiError('Image refused before upload', 422, 'validation_failed', [problem]);
  }

  const ticket = await apiRequest<AvatarUploadTicketView>('/api/v1/me/avatar', {
    method: 'POST',
    body: { content_type: file.type, file_size_bytes: file.size },
  });

  let put: Response;
  try {
    put = await fetch(ticket.upload_url, { method: ticket.method, headers: ticket.headers, body: file });
  } catch {
    throw new ApiError('Storage unreachable', 0, 'dependency_unavailable', ['upload_failed']);
  }
  if (!put.ok) {
    throw new ApiError('Storage refused the upload', put.status, 'dependency_unavailable', ['upload_failed']);
  }

  return apiRequest<ProfileView>('/api/v1/me/avatar/complete', {
    method: 'POST',
    body: { upload_id: ticket.upload_id },
  });
}
