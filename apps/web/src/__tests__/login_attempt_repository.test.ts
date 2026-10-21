import { describe, expect, it, vi } from 'vitest';
import { PrismaLoginAttemptRepository } from '@/server/infrastructure/auth/prisma_login_attempt_repository';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';

describe('PrismaLoginAttemptRepository (WP-M0-23, FR-AUTH-04)', () => {
  it('records login attempts with hashed identifier', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'att-1' });
    const mockPrisma = {
      authLoginAttempt: {
        create: createMock,
      },
    } as unknown as PrismaClient;

    const repo = new PrismaLoginAttemptRepository(mockPrisma);
    await repo.recordAttempt('hash123', '192.168.1.1', false);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        identifier: 'hash123',
        ip_address: '192.168.1.1',
        success: false,
      },
    });
  });

  it('calculates consecutive failures since last successful login', async () => {
    // 3 recent failed attempts followed by a success
    const findManyMock = vi.fn().mockResolvedValue([
      { success: false, attempted_at: new Date('2026-10-21T12:03:00Z') },
      { success: false, attempted_at: new Date('2026-10-21T12:02:00Z') },
      { success: false, attempted_at: new Date('2026-10-21T12:01:00Z') },
      { success: true, attempted_at: new Date('2026-10-21T12:00:00Z') },
      { success: false, attempted_at: new Date('2026-10-21T11:59:00Z') },
    ]);

    const mockPrisma = {
      authLoginAttempt: {
        findMany: findManyMock,
      },
    } as unknown as PrismaClient;

    const repo = new PrismaLoginAttemptRepository(mockPrisma);
    const count = await repo.getConsecutiveFailures('hash123');

    expect(count).toBe(3);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { identifier: 'hash123' },
      orderBy: { attempted_at: 'desc' },
      take: 20,
    });
  });

  it('returns 0 consecutive failures if most recent attempt was a success', async () => {
    const findManyMock = vi.fn().mockResolvedValue([
      { success: true, attempted_at: new Date('2026-10-21T12:05:00Z') },
      { success: false, attempted_at: new Date('2026-10-21T12:04:00Z') },
    ]);

    const mockPrisma = {
      authLoginAttempt: {
        findMany: findManyMock,
      },
    } as unknown as PrismaClient;

    const repo = new PrismaLoginAttemptRepository(mockPrisma);
    const count = await repo.getConsecutiveFailures('hash123');

    expect(count).toBe(0);
  });

  it('clearAttempts deletes failure records for the identifier', async () => {
    const deleteManyMock = vi.fn().mockResolvedValue({ count: 5 });
    const mockPrisma = {
      authLoginAttempt: {
        deleteMany: deleteManyMock,
      },
    } as unknown as PrismaClient;

    const repo = new PrismaLoginAttemptRepository(mockPrisma);
    await repo.clearAttempts('hash123');

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { identifier: 'hash123' },
    });
  });
});
