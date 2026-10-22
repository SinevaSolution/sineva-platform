import 'server-only';
import { Prisma } from './generated/client';

/**
 * A nullable jsonb column takes `Prisma.DbNull` to store SQL NULL. Plain `null`
 * is rejected by the client because it cannot tell SQL NULL from the JSON
 * value `null`, and the domain only ever means "never set".
 */
export function toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
