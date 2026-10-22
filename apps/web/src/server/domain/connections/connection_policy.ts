import type { UserRole } from '@/server/domain/entities/user';
import type { ConnectionEntity } from './connection';

/**
 * Who may reconnect or disconnect a connection (`connection.disconnect`): Owner
 * and Admin manage workspace connections; a Member only their own personal
 * one. Admins never reach another member's personal connection at all (the
 * repository hides it), so this rule covers the connections they can see.
 */
export function canManageConnection(
  role: UserRole,
  userId: string,
  connection: Pick<ConnectionEntity, 'owner_scope' | 'owner_user_id'>,
): boolean {
  if (connection.owner_scope === 'user') {
    return connection.owner_user_id === userId && role !== 'viewer';
  }
  return role === 'owner' || role === 'admin';
}
