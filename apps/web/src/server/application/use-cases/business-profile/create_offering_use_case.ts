import type { RequestContext } from '@/server/domain/context/request_context';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { OFFERING_LIMIT, type OfferingEntity } from '@/server/domain/business_profile/business_profile';
import { inspectProfileText } from '@/server/domain/business_profile/profile_text_guard';
import type { BusinessProfileRepository } from '@/server/domain/repositories/business_profile_repository';
import type { OfferingCreateDto } from '@/server/application/dtos/business_profile_dto';
import type { BusinessProfileWriter } from './profile_writer';

export class CreateOfferingUseCase {
  constructor(
    private readonly deps: { writer: BusinessProfileWriter; repo: BusinessProfileRepository; now: () => Date },
  ) {}

  async execute(input: {
    workspace_id: string;
    user_id: string;
    input: OfferingCreateDto;
    context: RequestContext;
  }): Promise<{ offering: OfferingEntity; version: number }> {
    const dto = input.input;
    inspectProfileText([
      { field: 'offerings.name', text: dto.name },
      ...(dto.description ? [{ field: 'offerings.description', text: dto.description }] : []),
    ]);

    let created: OfferingEntity | null = null;
    const result = await this.deps.writer.mutate(
      {
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        context: input.context,
        audit_action: 'profile.updated',
      },
      async (repo) => {
        // Counted inside the transaction so two requests cannot both pass at 49.
        if ((await repo.countOfferings(input.workspace_id)) >= OFFERING_LIMIT) {
          throw new ValidationError(`A workspace can hold up to ${OFFERING_LIMIT} offers.`, [
            { code: 'offerings_limit_reached', field: 'offerings', detail: `At most ${OFFERING_LIMIT} offers.` },
          ]);
        }
        created = await repo.createOffering(input.workspace_id, {
          name: dto.name,
          description: dto.description ?? null,
          // The only way a price gets here is the owner typing it.
          price_amount: dto.price_amount ?? null,
          price_currency: 'IDR',
          url: dto.url ?? null,
          source: dto.source ?? 'user',
          confirmed_at: dto.confirmed === false ? null : this.deps.now().toISOString(),
        });
        return { section: 'offerings', op: 'created' };
      },
    );
    return { offering: created as unknown as OfferingEntity, version: result.version };
  }
}
