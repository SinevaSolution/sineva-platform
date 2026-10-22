import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  createAnonymousRequestContext,
  type RequestContext,
} from '@/server/domain/context/request_context';
import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/server/domain/repositories/user_profile_repository';

export interface UpdateProfileUseCaseInput extends UpdateUserProfileInput {
  user_id: string;
  /** The request being served, so the audit row carries its request id and client address. */
  context?: RequestContext;
}

export class UpdateProfileUseCase {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  // Field values are already validated by `UpdateProfileSchema` at the edge.
  // `user_id` is the session user supplied by the route, never from the body.
  async execute(input: UpdateProfileUseCaseInput): Promise<UserProfileEntity> {
    const { user_id, context, ...changes } = input;

    // Read first so the audit row can carry the previous values; it also
    // turns a missing user into a 404 before anything is written.
    const before = await this.profiles.findById(user_id);
    if (!before) {
      throw new NotFoundError('User', user_id);
    }

    const updated = await this.profiles.update(user_id, changes);

    const changedFields = (Object.keys(changes) as Array<keyof UpdateUserProfileInput>).filter(
      (field) => changes[field] !== undefined,
    );
    // Values go through `change`, whose redaction replaces name values and
    // keeps locale and timezone; the field list alone says what happened.
    await this.auditLogger.log({
      action: 'user.profile_updated',
      context: context ?? { ...createAnonymousRequestContext('profile-update'), user_id },
      target_resource_type: 'user',
      target_resource_id: user_id,
      metadata: { changed_fields: changedFields },
      change: {
        before: Object.fromEntries(changedFields.map((field) => [field, before[field]])),
        after: Object.fromEntries(changedFields.map((field) => [field, updated[field]])),
      },
    });

    return updated;
  }
}
