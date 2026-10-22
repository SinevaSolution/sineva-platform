import { PROFILE_FIELD_KEYS, type ProfileSnapshot } from './business_profile';

export interface SnapshotChange {
  path: string;
  before: unknown;
  after: unknown;
}

// Stable stringify with sorted keys so key order never reads as a change.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

// Offers and policies are compared without their ids: restore re-creates rows
// with new ids, and that must not show up as an edit. Provenance and
// confirmation timestamps stay in the comparison because they are part of what
// the owner approved.
function withoutIds<T extends { id?: string }>(items: T[]): Array<Omit<T, 'id'>> {
  return items.map((item) => {
    const copy: { id?: string } = { ...item };
    delete copy.id;
    return copy as Omit<T, 'id'>;
  });
}

/**
 * Field-level diff for the profile fields, section-level for offers and
 * policies (the editor shows those as lists). `previous` null means the first
 * version: every set field and non-empty section is reported against null.
 */
export function diffSnapshots(previous: ProfileSnapshot | null, next: ProfileSnapshot): SnapshotChange[] {
  const changes: SnapshotChange[] = [];

  for (const key of PROFILE_FIELD_KEYS) {
    const before = previous ? previous.fields[key] : null;
    const after = next.fields[key];
    if (canonical(before) !== canonical(after)) {
      changes.push({ path: `fields.${key}`, before, after });
    }
  }

  const beforeOffers = previous ? withoutIds(previous.offerings) : [];
  const afterOffers = withoutIds(next.offerings);
  if (canonical(beforeOffers) !== canonical(afterOffers)) {
    changes.push({ path: 'offerings', before: beforeOffers, after: afterOffers });
  }

  const beforePolicies = previous ? withoutIds(previous.policies) : [];
  const afterPolicies = withoutIds(next.policies);
  if (canonical(beforePolicies) !== canonical(afterPolicies)) {
    changes.push({ path: 'policies', before: beforePolicies, after: afterPolicies });
  }

  return changes;
}
