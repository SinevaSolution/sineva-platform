import type { PreferencesView } from '@/shared/profile_view';
import { apiRequest } from './api';

/** Saves only the provided preferences; the server merges them into the stored row. */
export function savePreferences(patch: Partial<PreferencesView>): Promise<PreferencesView> {
  return apiRequest<PreferencesView>('/api/v1/me/preferences', { method: 'PATCH', body: patch });
}
