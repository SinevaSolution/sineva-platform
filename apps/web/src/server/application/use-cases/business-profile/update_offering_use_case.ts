import type { RequestContext } from '@/server/domain/context/request_context';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { OfferingEntity } from '@/server/domain/business_profile/business_profile';
import { inspectProfileText } from '@/server/domain/business_profile/profile_text_guard';
import type {
  BusinessProfileRepository,
  UpdateOfferingInput,
} from '@/server/domain/repositories/business_profile_repository';
import type { OfferingUpdateDto } from '@/server/application/dtos/business_profile_dto';
import type { BusinessProfileWriter } from './profile_writer';

export class UpdateOfferingUseCase {
  constructor(
    private readonly deps: { writer: BusinessProfileWriter; repo: BusinessProfileRepository; now: () => Date },
  ) {}

  async execute(input: {
    workspace_id: string;
    user_id: string;
    offering_id: string;
    input: OfferingUpdateDto;
    context: RequestContext;
  }): Promise<{ offering: OfferingEntity; version: number }> {
    const dto = input.input;
    inspectProfileText([
      ...(dto.name ? [{ field: 'offerings.name', text: dto.name }] : []),
      ...(dto.description ? [{ field: 'offerings.description', text: dto.description }] : []),
    ]);

    const patch: UpdateOfferingInput = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.price_amount !== undefined) patch.price_amount = dto.price_amount;
    if (dto.url !== undefined) patch.url = dto.url;
    if (dto.position !== undefined) patch.position = dto.position;
    if (dto.confirmed !== undefined) {
      patch.confirmed_at = dto.confirmed ? this.deps.now().toISOString() : null;
    }

    let updated: OfferingEntity | null = null;
    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        audit_action: 'profile.updated',
      },
      async (repo) => {
        updated = await repo.updateOffering(input.workspace_id, input.offering_id, patch);
        if (!updated) {
          // Another workspace's offering reads the same as a missing one.
          throw new NotFoundError('Offering', input.offering_id);
        }
        return { section: 'offerings', op: 'updated' };
      },
    );
    return { offering: updated as unknown as OfferingEntity, version: result.version };
  }
}
