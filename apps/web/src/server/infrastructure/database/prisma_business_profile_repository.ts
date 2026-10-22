import 'server-only';
import type { Prisma, PrismaClient } from './generated/client';
import { ConflictError } from '@/server/domain/errors/domain_error';
import {
  type BusinessProfileEntity,
  type FieldMeta,
  type OfferingEntity,
  type OfferingSource,
  type PolicyEntity,
  type PolicyKind,
  type PolicySource,
  type ProfileAggregate,
  type ProfileFields,
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
import { isUniqueViolation, toJson, toNullableJson } from './prisma_json';
import { activeClient } from './prisma_transaction_runner';

type ProfileRow = Prisma.BusinessProfileGetPayload<object>;
type OfferingRow = Prisma.BusinessOfferingGetPayload<object>;
type PolicyRow = Prisma.BusinessPolicyGetPayload<object>;
type VersionRow = Prisma.BusinessProfileVersionGetPayload<object>;

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);
const toDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(value);

function mapProfile(row: ProfileRow): BusinessProfileEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    version: row.version,
    display_name: row.display_name,
    legal_name: row.legal_name,
    industry: row.industry,
    city: row.city,
    province: row.province,
    languages: (row.languages as ProfileFields['languages']) ?? null,
    website_url: row.website_url,
    social_handles: (row.social_handles as ProfileFields['social_handles']) ?? null,
    business_hours: (row.business_hours as ProfileFields['business_hours']) ?? null,
    brand_voice: (row.brand_voice as ProfileFields['brand_voice']) ?? null,
    audience: row.audience,
    goals: (row.goals as ProfileFields['goals']) ?? null,
    field_meta: (row.field_meta as FieldMeta) ?? {},
    confirmed_at: iso(row.confirmed_at),
    updated_by: row.updated_by,
    updated_at: row.updated_at.toISOString(),
  };
}

function mapOffering(row: OfferingRow): OfferingEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description,
    // Integer IDR stays far below 2^53; the guard in the DTO caps it there.
    price_amount: row.price_amount === null ? null : Number(row.price_amount),
    price_currency: row.price_currency,
    url: row.url,
    position: row.position,
    source: row.source as OfferingSource,
    confirmed_at: iso(row.confirmed_at),
  };
}

function mapPolicy(row: PolicyRow): PolicyEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    kind: row.kind as PolicyKind,
    title: row.title,
    body: row.body,
    source: row.source as PolicySource,
    confirmed_at: iso(row.confirmed_at),
    updated_by: row.updated_by,
  };
}

function mapVersion(row: VersionRow): ProfileVersionEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    version: row.version,
    snapshot: row.snapshot as unknown as ProfileSnapshot,
    changed_paths: row.changed_paths as string[],
    change_kind: row.change_kind as 'save' | 'restore',
    restored_from: row.restored_from,
    changed_by: row.changed_by,
    created_at: row.created_at.toISOString(),
  };
}

// The jsonb columns need DbNull for "cleared"; the text columns take null as is.
const JSON_FIELDS: ReadonlySet<string> = new Set([
  'languages',
  'social_handles',
  'business_hours',
  'brand_voice',
  'goals',
]);

function profileColumns(fields: Partial<ProfileFields>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    data[key] = JSON_FIELDS.has(key) ? toNullableJson(value) : value;
  }
  return data;
}

/**
 * Every method filters by `workspace_id`. Reads and writes go through
 * `activeClient` so they join the transaction of the use case (the writer runs
 * profile change, version bump, version row and audit row as one).
 */
export class PrismaBusinessProfileRepository implements BusinessProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): Prisma.TransactionClient {
    return activeClient(this.prisma);
  }

  async load(workspaceId: string): Promise<ProfileAggregate> {
    const [profile, offerings, policies] = await Promise.all([
      this.db.businessProfile.findUnique({ where: { workspace_id: workspaceId } }),
      this.db.businessOffering.findMany({ where: { workspace_id: workspaceId }, orderBy: [{ position: 'asc' }, { created_at: 'asc' }] }),
      this.db.businessPolicy.findMany({ where: { workspace_id: workspaceId }, orderBy: { created_at: 'asc' } }),
    ]);
    return {
      profile: profile ? mapProfile(profile) : null,
      offerings: offerings.map(mapOffering),
      policies: policies.map(mapPolicy),
    };
  }

  async ensureProfile(workspaceId: string, updatedBy: string): Promise<BusinessProfileEntity> {
    const existing = await this.db.businessProfile.findUnique({ where: { workspace_id: workspaceId } });
    if (existing) return mapProfile(existing);
    try {
      return mapProfile(
        await this.db.businessProfile.create({ data: { workspace_id: workspaceId, updated_by: updatedBy } }),
      );
    } catch (error) {
      // Lost a race with a concurrent first save: the other row is the one to use.
      if (isUniqueViolation(error)) {
        return mapProfile(await this.db.businessProfile.findUniqueOrThrow({ where: { workspace_id: workspaceId } }));
      }
      throw error;
    }
  }

  async updateProfile(workspaceId: string, input: UpdateProfileRowInput, updatedBy: string): Promise<BusinessProfileEntity> {
    await this.ensureProfile(workspaceId, updatedBy);
    const row = await this.db.businessProfile.update({
      where: { workspace_id: workspaceId },
      data: {
        ...(profileColumns(input.fields) as Prisma.BusinessProfileUpdateInput),
        field_meta: toJson(input.field_meta),
        ...(input.confirmed_at !== undefined ? { confirmed_at: toDate(input.confirmed_at) } : {}),
        updated_by: updatedBy,
      },
    });
    return mapProfile(row);
  }

  async bumpVersion(workspaceId: string, expected: number, updatedBy: string): Promise<number> {
    const result = await this.db.businessProfile.updateMany({
      where: { workspace_id: workspaceId, version: expected },
      data: { version: expected + 1, updated_by: updatedBy },
    });
    if (result.count === 0) {
      // Someone else saved first: the caller's copy is stale.
      throw new ConflictError('Business profile version', String(expected));
    }
    return expected + 1;
  }

  async insertVersion(input: InsertVersionInput): Promise<ProfileVersionEntity> {
    try {
      const row = await this.db.businessProfileVersion.create({
        data: {
          workspace_id: input.workspace_id,
          version: input.version,
          snapshot: toJson(input.snapshot),
          changed_paths: toJson(input.changed_paths),
          change_kind: input.change_kind,
          restored_from: input.restored_from,
          changed_by: input.changed_by,
        },
      });
      return mapVersion(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Business profile version', String(input.version));
      }
      throw error;
    }
  }

  async listVersions(workspaceId: string, limit: number, before?: number): Promise<ProfileVersionSummary[]> {
    const rows = await this.db.businessProfileVersion.findMany({
      where: { workspace_id: workspaceId, ...(before !== undefined ? { version: { lt: before } } : {}) },
      orderBy: { version: 'desc' },
      take: limit,
      select: {
        id: true,
        workspace_id: true,
        version: true,
        changed_paths: true,
        change_kind: true,
        restored_from: true,
        changed_by: true,
        created_at: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      version: row.version,
      changed_paths: row.changed_paths as string[],
      change_kind: row.change_kind as 'save' | 'restore',
      restored_from: row.restored_from,
      changed_by: row.changed_by,
      created_at: row.created_at.toISOString(),
    }));
  }

  async getVersion(workspaceId: string, version: number): Promise<ProfileVersionEntity | null> {
    const row = await this.db.businessProfileVersion.findUnique({
      where: { workspace_id_version: { workspace_id: workspaceId, version } },
    });
    return row ? mapVersion(row) : null;
  }

  async countOfferings(workspaceId: string): Promise<number> {
    return this.db.businessOffering.count({ where: { workspace_id: workspaceId } });
  }

  async createOffering(workspaceId: string, input: CreateOfferingInput): Promise<OfferingEntity> {
    const last = await this.db.businessOffering.aggregate({
      where: { workspace_id: workspaceId },
      _max: { position: true },
    });
    const row = await this.db.businessOffering.create({
      data: {
        workspace_id: workspaceId,
        name: input.name,
        description: input.description,
        price_amount: input.price_amount === null ? null : BigInt(input.price_amount),
        price_currency: input.price_currency,
        url: input.url,
        position: (last._max.position ?? -1) + 1,
        source: input.source,
        confirmed_at: toDate(input.confirmed_at),
      },
    });
    return mapOffering(row);
  }

  async updateOffering(workspaceId: string, id: string, input: UpdateOfferingInput): Promise<OfferingEntity | null> {
    const result = await this.db.businessOffering.updateMany({
      where: { id, workspace_id: workspaceId },
      data: {
        name: input.name,
        description: input.description,
        price_amount:
          input.price_amount === undefined ? undefined : input.price_amount === null ? null : BigInt(input.price_amount),
        url: input.url,
        position: input.position,
        confirmed_at: toDate(input.confirmed_at),
      },
    });
    if (result.count === 0) return null;
    const row = await this.db.businessOffering.findFirst({ where: { id, workspace_id: workspaceId } });
    return row ? mapOffering(row) : null;
  }

  async deleteOffering(workspaceId: string, id: string): Promise<boolean> {
    return (await this.db.businessOffering.deleteMany({ where: { id, workspace_id: workspaceId } })).count > 0;
  }

  async createPolicy(workspaceId: string, input: CreatePolicyInput): Promise<PolicyEntity> {
    const row = await this.db.businessPolicy.create({
      data: {
        workspace_id: workspaceId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        source: input.source,
        confirmed_at: toDate(input.confirmed_at),
        updated_by: input.updated_by,
      },
    });
    return mapPolicy(row);
  }

  async updatePolicy(workspaceId: string, id: string, input: UpdatePolicyInput): Promise<PolicyEntity | null> {
    const result = await this.db.businessPolicy.updateMany({
      where: { id, workspace_id: workspaceId },
      data: {
        kind: input.kind,
        title: input.title,
        body: input.body,
        confirmed_at: toDate(input.confirmed_at),
        updated_by: input.updated_by,
        // `updateMany` skips the client-side @updatedAt, so it is set here.
        updated_at: new Date(),
      },
    });
    if (result.count === 0) return null;
    const row = await this.db.businessPolicy.findFirst({ where: { id, workspace_id: workspaceId } });
    return row ? mapPolicy(row) : null;
  }

  async deletePolicy(workspaceId: string, id: string): Promise<boolean> {
    return (await this.db.businessPolicy.deleteMany({ where: { id, workspace_id: workspaceId } })).count > 0;
  }

  async replaceContents(workspaceId: string, snapshot: ProfileSnapshot, updatedBy: string): Promise<void> {
    await this.ensureProfile(workspaceId, updatedBy);
    await this.db.businessProfile.update({
      where: { workspace_id: workspaceId },
      data: {
        ...(profileColumns(snapshot.fields) as Prisma.BusinessProfileUpdateInput),
        field_meta: toJson(snapshot.field_meta),
        confirmed_at: toDate(snapshot.confirmed_at),
        updated_by: updatedBy,
      },
    });
    await this.db.businessOffering.deleteMany({ where: { workspace_id: workspaceId } });
    await this.db.businessPolicy.deleteMany({ where: { workspace_id: workspaceId } });
    if (snapshot.offerings.length > 0) {
      await this.db.businessOffering.createMany({
        data: snapshot.offerings.map((o) => ({
          workspace_id: workspaceId,
          name: o.name,
          description: o.description,
          price_amount: o.price_amount === null ? null : BigInt(o.price_amount),
          price_currency: o.price_currency,
          url: o.url,
          position: o.position,
          source: o.source,
          confirmed_at: toDate(o.confirmed_at),
        })),
      });
    }
    if (snapshot.policies.length > 0) {
      await this.db.businessPolicy.createMany({
        data: snapshot.policies.map((p) => ({
          workspace_id: workspaceId,
          kind: p.kind,
          title: p.title,
          body: p.body,
          source: p.source,
          confirmed_at: toDate(p.confirmed_at),
          updated_by: p.updated_by,
        })),
      });
    }
  }
}
