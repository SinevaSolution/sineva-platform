import { ConflictError } from '@/server/domain/errors/domain_error';
import {
  EMPTY_PROFILE_FIELDS,
  type BusinessProfileEntity,
  type OfferingEntity,
  type PolicyEntity,
  type ProfileAggregate,
  type ProfileSnapshot,
  type ProfileVersionEntity,
} from '@/server/domain/business_profile/business_profile';
import type {
  BusinessProfileRepository,
  CreateOfferingInput,
  CreatePolicyInput,
  InsertVersionInput,
  ProfileVersionSummary,
  UpdateOfferingInput,
  UpdatePolicyInput,
  UpdateProfileRowInput,
} from '@/server/domain/repositories/business_profile_repository';

/** In-memory twin of the Prisma adapter: same workspace scoping, same version conflict rule. */
export class InMemoryBusinessProfileRepository implements BusinessProfileRepository {
  profiles = new Map<string, BusinessProfileEntity>();
  offerings: OfferingEntity[] = [];
  policies: PolicyEntity[] = [];
  versions: ProfileVersionEntity[] = [];
  private seq = 0;

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async load(workspaceId: string): Promise<ProfileAggregate> {
    return {
      profile: this.profiles.get(workspaceId) ?? null,
      offerings: this.offerings
        .filter((o) => o.workspace_id === workspaceId)
        .sort((a, b) => a.position - b.position),
      policies: this.policies.filter((p) => p.workspace_id === workspaceId),
    };
  }

  async ensureProfile(workspaceId: string, updatedBy: string): Promise<BusinessProfileEntity> {
    const existing = this.profiles.get(workspaceId);
    if (existing) return existing;
    const created: BusinessProfileEntity = {
      id: this.id('profile'),
      workspace_id: workspaceId,
      ...EMPTY_PROFILE_FIELDS,
      version: 0,
      field_meta: {},
      confirmed_at: null,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(workspaceId, created);
    return created;
  }

  async updateProfile(workspaceId: string, input: UpdateProfileRowInput, updatedBy: string) {
    const current = await this.ensureProfile(workspaceId, updatedBy);
    const next: BusinessProfileEntity = {
      ...current,
      ...input.fields,
      field_meta: input.field_meta,
      confirmed_at: input.confirmed_at === undefined ? current.confirmed_at : input.confirmed_at,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(workspaceId, next);
    return next;
  }

  async bumpVersion(workspaceId: string, expected: number, updatedBy: string): Promise<number> {
    const current = this.profiles.get(workspaceId);
    if (!current || current.version !== expected) {
      throw new ConflictError('Business profile version', String(expected));
    }
    this.profiles.set(workspaceId, { ...current, version: expected + 1, updated_by: updatedBy });
    return expected + 1;
  }

  async insertVersion(input: InsertVersionInput): Promise<ProfileVersionEntity> {
    if (this.versions.some((v) => v.workspace_id === input.workspace_id && v.version === input.version)) {
      throw new ConflictError('Business profile version', String(input.version));
    }
    const row: ProfileVersionEntity = {
      id: this.id('version'),
      ...input,
      created_at: new Date().toISOString(),
    };
    this.versions.push(row);
    return row;
  }

  async listVersions(workspaceId: string, limit: number, before?: number): Promise<ProfileVersionSummary[]> {
    return this.versions
      .filter((v) => v.workspace_id === workspaceId && (before === undefined || v.version < before))
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
      .map((v) => {
        const summary: Partial<ProfileVersionEntity> = { ...v };
        delete summary.snapshot;
        return summary as ProfileVersionSummary;
      });
  }

  async getVersion(workspaceId: string, version: number) {
    return this.versions.find((v) => v.workspace_id === workspaceId && v.version === version) ?? null;
  }

  async countOfferings(workspaceId: string): Promise<number> {
    return this.offerings.filter((o) => o.workspace_id === workspaceId).length;
  }

  async createOffering(workspaceId: string, input: CreateOfferingInput): Promise<OfferingEntity> {
    const position = await this.countOfferings(workspaceId);
    const row: OfferingEntity = { id: this.id('offering'), workspace_id: workspaceId, position, ...input };
    this.offerings.push(row);
    return row;
  }

  async updateOffering(workspaceId: string, id: string, input: UpdateOfferingInput) {
    const index = this.offerings.findIndex((o) => o.id === id && o.workspace_id === workspaceId);
    if (index === -1) return null;
    this.offerings[index] = { ...this.offerings[index], ...input };
    return this.offerings[index];
  }

  async deleteOffering(workspaceId: string, id: string): Promise<boolean> {
    const before = this.offerings.length;
    this.offerings = this.offerings.filter((o) => !(o.id === id && o.workspace_id === workspaceId));
    return this.offerings.length < before;
  }

  async createPolicy(workspaceId: string, input: CreatePolicyInput): Promise<PolicyEntity> {
    const row: PolicyEntity = { id: this.id('policy'), workspace_id: workspaceId, ...input };
    this.policies.push(row);
    return row;
  }

  async updatePolicy(workspaceId: string, id: string, input: UpdatePolicyInput) {
    const index = this.policies.findIndex((p) => p.id === id && p.workspace_id === workspaceId);
    if (index === -1) return null;
    this.policies[index] = { ...this.policies[index], ...input };
    return this.policies[index];
  }

  async deletePolicy(workspaceId: string, id: string): Promise<boolean> {
    const before = this.policies.length;
    this.policies = this.policies.filter((p) => !(p.id === id && p.workspace_id === workspaceId));
    return this.policies.length < before;
  }

  async replaceContents(workspaceId: string, snapshot: ProfileSnapshot, updatedBy: string): Promise<void> {
    const current = await this.ensureProfile(workspaceId, updatedBy);
    this.profiles.set(workspaceId, {
      ...current,
      ...snapshot.fields,
      field_meta: snapshot.field_meta,
      confirmed_at: snapshot.confirmed_at,
      updated_by: updatedBy,
    });
    this.offerings = this.offerings.filter((o) => o.workspace_id !== workspaceId);
    this.policies = this.policies.filter((p) => p.workspace_id !== workspaceId);
    for (const o of snapshot.offerings) {
      this.offerings.push({ ...o, id: this.id('offering'), workspace_id: workspaceId });
    }
    for (const p of snapshot.policies) {
      this.policies.push({ ...p, id: this.id('policy'), workspace_id: workspaceId });
    }
  }
}
