// Business Profile domain types (FR-ONB-14 to FR-ONB-20). Wire shapes: ISO
// strings for timestamps, snake_case keys, integer IDR for prices.

export const PROFILE_FIELD_KEYS = [
  'display_name',
  'legal_name',
  'industry',
  'city',
  'province',
  'languages',
  'website_url',
  'social_handles',
  'business_hours',
  'brand_voice',
  'audience',
  'goals',
] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

export const GOAL_KEYS = [
  'faster_replies',
  'organize_finances',
  'create_content',
  'find_customers',
  'manage_staff',
  'tax_admin',
  'understand_numbers',
] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

export const FORMALITY_VALUES = ['formal', 'neutral', 'casual'] as const;
export const SECOND_PERSON_VALUES = ['anda', 'kamu', 'avoid'] as const;
export const EMOJI_USE_VALUES = ['never', 'sometimes', 'often'] as const;

export interface BrandVoice {
  formality?: (typeof FORMALITY_VALUES)[number];
  second_person?: (typeof SECOND_PERSON_VALUES)[number];
  emoji_use?: (typeof EMOJI_USE_VALUES)[number];
  words_to_use?: string[];
  words_to_avoid?: string[];
  samples?: string[];
}

export interface BusinessHours {
  note?: string;
  days?: Array<{ day: string; opens: string; closes: string }>;
}

export type SocialHandles = Partial<
  Record<'instagram' | 'tiktok' | 'facebook' | 'x' | 'marketplace_url', string>
>;

export interface ProfileFields {
  display_name: string | null;
  legal_name: string | null;
  industry: string | null;
  city: string | null;
  province: string | null;
  languages: string[] | null;
  website_url: string | null;
  social_handles: SocialHandles | null;
  business_hours: BusinessHours | null;
  brand_voice: BrandVoice | null;
  audience: string | null;
  goals: GoalKey[] | null;
}

export type FieldSource = 'user' | 'website';

/** A field is confirmed exactly when it has an entry here (FR-ONB-06). */
export type FieldMeta = Partial<Record<ProfileFieldKey, { source: FieldSource; confirmed_at: string }>>;

export interface BusinessProfileEntity extends ProfileFields {
  id: string;
  workspace_id: string;
  version: number;
  field_meta: FieldMeta;
  confirmed_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export const OFFERING_LIMIT = 50;

export type OfferingSource = 'user' | 'scan';

export interface OfferingEntity {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  /** Integer IDR, typed by the user, never inferred (FR-ONB-16). */
  price_amount: number | null;
  price_currency: string;
  url: string | null;
  position: number;
  source: OfferingSource;
  confirmed_at: string | null;
}

export const POLICY_KINDS = ['returns', 'shipping', 'payment', 'hours', 'faq', 'other'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];
export type PolicySource = 'user' | 'scan';

export interface PolicyEntity {
  id: string;
  workspace_id: string;
  kind: PolicyKind;
  title: string;
  body: string;
  source: PolicySource;
  confirmed_at: string | null;
  updated_by: string | null;
}

/** Everything a version freezes. Ids are kept for reference, restore assigns new ones. */
export interface ProfileSnapshot {
  fields: ProfileFields;
  field_meta: FieldMeta;
  confirmed_at: string | null;
  offerings: Array<Omit<OfferingEntity, 'id' | 'workspace_id'> & { id?: string }>;
  policies: Array<Omit<PolicyEntity, 'id' | 'workspace_id'> & { id?: string }>;
}

export interface ProfileVersionEntity {
  id: string;
  workspace_id: string;
  version: number;
  snapshot: ProfileSnapshot;
  /** Dotted paths that differ from the previous version. */
  changed_paths: string[];
  change_kind: 'save' | 'restore';
  restored_from: number | null;
  changed_by: string;
  created_at: string;
}

/** A profile row, or the empty shell (`id` null, version 0) of a workspace that never saved one. */
export type BusinessProfileView = Omit<BusinessProfileEntity, 'id' | 'updated_at'> & {
  id: string | null;
  updated_at: string | null;
};

/** What a read of the profile returns: the profile row (or an empty shell), offers and policies. */
export interface ProfileAggregate {
  profile: BusinessProfileEntity | null;
  offerings: OfferingEntity[];
  policies: PolicyEntity[];
}

export const EMPTY_PROFILE_FIELDS: ProfileFields = {
  display_name: null,
  legal_name: null,
  industry: null,
  city: null,
  province: null,
  languages: null,
  website_url: null,
  social_handles: null,
  business_hours: null,
  brand_voice: null,
  audience: null,
  goals: null,
};

export function snapshotOf(aggregate: ProfileAggregate): ProfileSnapshot {
  const profile = aggregate.profile;
  return {
    fields: profile
      ? {
          display_name: profile.display_name,
          legal_name: profile.legal_name,
          industry: profile.industry,
          city: profile.city,
          province: profile.province,
          languages: profile.languages,
          website_url: profile.website_url,
          social_handles: profile.social_handles,
          business_hours: profile.business_hours,
          brand_voice: profile.brand_voice,
          audience: profile.audience,
          goals: profile.goals,
        }
      : { ...EMPTY_PROFILE_FIELDS },
    field_meta: profile?.field_meta ?? {},
    confirmed_at: profile?.confirmed_at ?? null,
    offerings: aggregate.offerings.map((o) => without(o, 'workspace_id')),
    policies: aggregate.policies.map((p) => without(p, 'workspace_id')),
  };
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
