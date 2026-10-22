import { NotFoundError } from '@/server/domain/errors/domain_error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A path id that is not a UUID cannot name any row, so it is a 404 like an unknown
 * one, not a database error. The use case never sees a malformed id.
 */
export function requireUuid(value: string | undefined, resource: string): string {
  if (!value || !UUID.test(value)) throw new NotFoundError(resource, value ?? '');
  return value;
}
