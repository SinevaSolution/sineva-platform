import {
  PROFILE_FIELD_KEYS,
  type FieldMeta,
  type FieldSource,
  type ProfileFields,
} from '@/server/domain/business_profile/business_profile';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';

/**
 * Writes the profile values of a save and stamps each non-empty one as
 * confirmed (source and time) in `field_meta`. Must run inside the writer's
 * transaction.
 *
 * - `null` clears a field and drops its confirmation: empty stays empty.
 * - A value that did not change keeps its original confirmation time; only a
 *   new value (or a new provenance) is stamped again.
 * - The profile-level `confirmed_at` is set the first time anything is
 *   confirmed and never moves afterwards.
 */
export async function applyConfirmedFields(
  repo: BusinessProfileRepository,
  args: {
    workspace_id: string;
    user_id: string;
    values: Partial<ProfileFields>;
    sources: Partial<Record<string, FieldSource>>;
    now: string;
  },
): Promise<void> {
  const current = (await repo.load(args.workspace_id)).profile;
  const meta: FieldMeta = { ...(current?.field_meta ?? {}) };
  const fields: Partial<ProfileFields> = {};

  for (const key of PROFILE_FIELD_KEYS) {
    if (!(key in args.values)) continue;
    const next = (args.values as Record<string, unknown>)[key] ?? null;
    const previous = current ? ((current as unknown as Record<string, unknown>)[key] ?? null) : null;
    (fields as Record<string, unknown>)[key] = next;
    if (next === null) {
      delete meta[key];
      continue;
    }
    const source = args.sources[key] ?? 'user';
    const unchanged = JSON.stringify(previous) === JSON.stringify(next);
    if (!unchanged || !meta[key] || meta[key]?.source !== source) {
      meta[key] = { source, confirmed_at: args.now };
    }
  }

  await repo.updateProfile(
    args.workspace_id,
    {
      fields,
      field_meta: meta,
      confirmed_at: current?.confirmed_at ?? (Object.keys(meta).length > 0 ? args.now : null),
    },
    args.user_id,
  );
}
