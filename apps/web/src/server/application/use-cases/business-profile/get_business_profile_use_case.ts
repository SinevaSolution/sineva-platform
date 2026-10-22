import {
  EMPTY_PROFILE_FIELDS,
  type BusinessProfileView,
  type OfferingEntity,
  type PolicyEntity,
  type ProfileAggregate,
} from '@/server/domain/business_profile/business_profile';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';

export interface BusinessProfileResult {
  profile: BusinessProfileView;
  offerings: OfferingEntity[];
  policies: PolicyEntity[];
}

/**
 * A workspace that never saved a profile reads as an empty shell (version 0,
 * every field null). Nothing is written by a read and nothing is invented: an
 * empty profile is an empty profile (FR-ONB, "no fabricated defaults").
 */
export function toProfileResult(workspaceId: string, aggregate: ProfileAggregate): BusinessProfileResult {
  return {
    profile: aggregate.profile ?? {
      id: null,
      workspace_id: workspaceId,
      ...EMPTY_PROFILE_FIELDS,
      version: 0,
      field_meta: {},
      confirmed_at: null,
      updated_by: null,
      updated_at: null,
    },
    offerings: aggregate.offerings,
    policies: aggregate.policies,
  };
}

export class GetBusinessProfileUseCase {
  constructor(private readonly repo: BusinessProfileRepository) {}

  async execute(input: { workspace_id: string }): Promise<BusinessProfileResult> {
    return toProfileResult(input.workspace_id, await this.repo.load(input.workspace_id));
  }
}
