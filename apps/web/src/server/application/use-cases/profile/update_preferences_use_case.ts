import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import {
  createAnonymousRequestContext,
  type RequestContext,
} from '@/server/domain/context/request_context';
import type { UserPreferencesEntity } from '@/server/domain/entities/user_preferences';
import type { UserPreferencesRepository } from '@/server/domain/repositories/user_preferences_repository';

export interface UpdatePreferencesInput extends Partial<UserPreferencesEntity> {
  user_id: string;
  context?: RequestContext;
}

export class UpdatePreferencesUseCase {
  constructor(
    private readonly preferences: UserPreferencesRepository,
    private readonly auditLogger: AuditLogger,
  ) {}

  // The row is keyed on the session user, so there is no way to name another
  // person's preferences.
  async execute(input: UpdatePreferencesInput): Promise<UserPreferencesEntity> {
    const { user_id, context, ...changes } = input;
    const changedFields = (Object.keys(changes) as Array<keyof UserPreferencesEntity>).filter(
      (field) => changes[field] !== undefined,
    );

    const updated = await this.preferences.upsert(user_id, changes);

    await this.auditLogger.log({
      action: 'user.preferences_updated',
      context: context ?? { ...createAnonymousRequestContext('preferences-update'), user_id },
      target_resource_type: 'user',
      target_resource_id: user_id,
      metadata: { changed_fields: changedFields },
    });

    return updated;
  }
}
