import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError, ValidationError } from '@/server/domain/errors/domain_error';
import {
  PROFILE_FIELD_KEYS,
  type FieldSource,
  type ProfileFields,
} from '@/server/domain/business_profile/business_profile';
import {
  collectProfileTexts,
  inspectProfileText,
  type ProfileWarning,
} from '@/server/domain/business_profile/profile_text_guard';
import type { ProfileScanRepository } from '@/server/domain/repositories/onboarding_repositories';
import type { SaveProfileDto } from '@/server/application/dtos/business_profile_dto';
import type { BusinessProfileWriter } from './profile_writer';
import { applyConfirmedFields } from './apply_confirmed_fields';
import { toProfileResult, type BusinessProfileResult } from './get_business_profile_use_case';

export interface SaveBusinessProfileInput {
  workspace_id: string;
  user_id: string;
  input: SaveProfileDto;
  context: RequestContext;
}

export interface SaveBusinessProfileResult extends BusinessProfileResult {
  version: number;
  changed: boolean;
  /** Owner-facing hints (instruction-like text, special categories). The text is saved regardless. */
  warnings: ProfileWarning[];
}

export function sourceError(detail: string, code: string): never {
  throw new ValidationError(detail, [{ code, field: 'field_sources', detail }]);
}

/**
 * Checks `field_sources` against the values being saved and the scan they cite.
 * A `website` source needs a live, usable scan of the same workspace: the label
 * "From your website" is a claim about where a value came from, so it must
 * name something real. Another workspace's scan reads as not found.
 */
export async function resolveFieldSources(
  scans: ProfileScanRepository,
  now: Date,
  workspaceId: string,
  values: Partial<ProfileFields>,
  input: Pick<SaveProfileDto, 'field_sources' | 'scan_id'>,
): Promise<Partial<Record<string, FieldSource>>> {
  const sources = input.field_sources ?? {};
  const keys = Object.keys(sources);
  if (keys.length === 0) {
    return {};
  }
  for (const key of keys) {
    if ((values as Record<string, unknown>)[key] == null) {
      sourceError(`field_sources names '${key}', which this request does not set.`, 'invalid_field_source');
    }
  }
  if (Object.values(sources).includes('website')) {
    if (!input.scan_id) {
      sourceError('A website source needs the scan it came from.', 'scan_required');
    }
    const scan = await scans.findById(workspaceId, input.scan_id as string);
    if (!scan || Date.parse(scan.expires_at) <= now.getTime()) {
      throw new NotFoundError('Profile scan', input.scan_id as string);
    }
    if (scan.status !== 'succeeded' && scan.status !== 'partial') {
      sourceError('That scan did not read the page.', 'scan_not_usable');
    }
  }
  return sources;
}

export class SaveBusinessProfileUseCase {
  constructor(
    private readonly deps: {
      writer: BusinessProfileWriter;
      scans: ProfileScanRepository;
      now: () => Date;
    },
  ) {}

  async execute({ workspace_id, user_id, input, context }: SaveBusinessProfileInput): Promise<SaveBusinessProfileResult> {
    const values: Partial<ProfileFields> = {};
    for (const key of PROFILE_FIELD_KEYS) {
      if (input[key] !== undefined) {
        (values as Record<string, unknown>)[key] = input[key];
      }
    }

    // Everything that can reject the request runs before the writer opens a
    // transaction, so a refused save leaves no profile row behind.
    const warnings = inspectProfileText(collectProfileTexts(values));
    const now = this.deps.now();
    const sources = await resolveFieldSources(this.deps.scans, now, workspace_id, values, input);

    const result = await this.deps.writer.mutate(
      {
        workspace_id,
        user_id,
        context,
        base_version: input.base_version,
        audit_action: 'profile.updated',
      },
      async (repo) => {
        await applyConfirmedFields(repo, { workspace_id, user_id, values, sources, now: now.toISOString() });
        return { section: 'profile' };
      },
    );

    return {
      ...toProfileResult(workspace_id, result.aggregate),
      version: result.version,
      changed: result.changed,
      warnings,
    };
  }
}
