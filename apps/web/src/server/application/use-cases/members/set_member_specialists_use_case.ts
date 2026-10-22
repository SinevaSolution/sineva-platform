import type { RequestContext } from '@/server/domain/context/request_context';
import type { MemberView } from '@/shared/members_view';
import type { UpdateMemberUseCase } from './update_member_use_case';

/**
 * `PUT .../members/{id}/specialists`: replaces the allowlist and makes the
 * scope `selected` in one step. A thin wrapper so the rules (member role
 * only, manifest slugs only, non-empty, audited) live in exactly one place.
 */
export class SetMemberSpecialistsUseCase {
  constructor(private readonly update: Pick<UpdateMemberUseCase, 'execute'>) {}

  execute(input: {
    context: RequestContext;
    member_id: string;
    specialist_slugs: string[];
  }): Promise<MemberView> {
    return this.update.execute({
      context: input.context,
      member_id: input.member_id,
      specialist_scope: 'selected',
      specialist_slugs: input.specialist_slugs,
    });
  }
}
