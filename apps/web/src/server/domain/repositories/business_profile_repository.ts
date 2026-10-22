import type {
  FieldMeta,
  OfferingEntity,
  OfferingSource,
  PolicyEntity,
  PolicyKind,
  PolicySource,
  ProfileAggregate,
  ProfileFields,
  ProfileSnapshot,
  ProfileVersionEntity,
  BusinessProfileEntity,
} from '@/server/domain/business_profile/business_profile';

export interface UpdateProfileRowInput {
  fields: Partial<ProfileFields>;
  field_meta: FieldMeta;
  /** Set once, when the owner first confirms the profile. */
  confirmed_at?: string | null;
}

export interface CreateOfferingInput {
  name: string;
  description: string | null;
  price_amount: number | null;
  price_currency: string;
  url: string | null;
  source: OfferingSource;
  confirmed_at: string | null;
}

export type UpdateOfferingInput = Partial<Omit<CreateOfferingInput, 'source'>> & { position?: number };

export interface CreatePolicyInput {
  kind: PolicyKind;
  title: string;
  body: string;
  source: PolicySource;
  confirmed_at: string | null;
  updated_by: string;
}

export type UpdatePolicyInput = Partial<Omit<CreatePolicyInput, 'source'>>;

export type ProfileVersionSummary = Omit<ProfileVersionEntity, 'snapshot'>;

export interface InsertVersionInput {
  workspace_id: string;
  version: number;
  snapshot: ProfileSnapshot;
  changed_paths: string[];
  change_kind: 'save' | 'restore';
  restored_from: number | null;
  changed_by: string;
}

/**
 * Every method takes the workspace id and filters by it, so a row of another
 * workspace is unreachable even with a guessed id (FR-AUTH-29). Writes join the
 * active transaction (see `TransactionRunner`); a use case that changes the
 * profile, bumps the version and inserts the version row runs them in one.
 */
export interface BusinessProfileRepository {
  load(workspaceId: string): Promise<ProfileAggregate>;
  /** Creates the empty profile row (version 0) when the workspace has none. */
  ensureProfile(workspaceId: string, updatedBy: string): Promise<BusinessProfileEntity>;
  updateProfile(workspaceId: string, input: UpdateProfileRowInput, updatedBy: string): Promise<BusinessProfileEntity>;
  /**
   * Moves the version from `expected` to `expected + 1`.
   * @throws ConflictError when the stored version is not `expected`.
   */
  bumpVersion(workspaceId: string, expected: number, updatedBy: string): Promise<number>;
  insertVersion(input: InsertVersionInput): Promise<ProfileVersionEntity>;
  /** Newest first. `before` is exclusive and is the cursor. */
  listVersions(workspaceId: string, limit: number, before?: number): Promise<ProfileVersionSummary[]>;
  getVersion(workspaceId: string, version: number): Promise<ProfileVersionEntity | null>;

  countOfferings(workspaceId: string): Promise<number>;
  createOffering(workspaceId: string, input: CreateOfferingInput): Promise<OfferingEntity>;
  /** Null when the offering does not exist in this workspace. */
  updateOffering(workspaceId: string, id: string, input: UpdateOfferingInput): Promise<OfferingEntity | null>;
  deleteOffering(workspaceId: string, id: string): Promise<boolean>;

  createPolicy(workspaceId: string, input: CreatePolicyInput): Promise<PolicyEntity>;
  updatePolicy(workspaceId: string, id: string, input: UpdatePolicyInput): Promise<PolicyEntity | null>;
  deletePolicy(workspaceId: string, id: string): Promise<boolean>;

  /** Restore: replaces profile fields, offerings and policies with the snapshot. Rows get new ids. */
  replaceContents(workspaceId: string, snapshot: ProfileSnapshot, updatedBy: string): Promise<void>;
}
