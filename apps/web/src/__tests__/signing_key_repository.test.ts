import { describe, expect, it, vi } from 'vitest';
import { PrismaSigningKeyRepository } from '@/server/infrastructure/database/prisma_signing_key_repository';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { SigningKeyEntity } from '@/server/domain/entities/signing_key';

describe('PrismaSigningKeyRepository (WP-M0-27)', () => {
  const mockDate = new Date('2026-10-21T12:00:00Z');
  const mockFutureDate = new Date('2027-10-21T12:00:00Z');

  const mockDbRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    kid: 'k1',
    alg: 'EdDSA',
    public_key: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
    status: 'active',
    purpose: 'context',
    valid_from: mockDate,
    valid_until: mockFutureDate,
    created_at: mockDate,
    updated_at: mockDate,
  };

  it('maps database row correctly in findActiveKey', async () => {
    const mockPrisma = {
      signingKey: {
        findFirst: vi.fn().mockResolvedValue(mockDbRow),
      },
    } as unknown as PrismaClient;

    const repo = new PrismaSigningKeyRepository(mockPrisma);
    const key = await repo.findActiveKey('context');

    expect(key).not.toBeNull();
    expect(key?.kid).toBe('k1');
    expect(key?.alg).toBe('EdDSA');
    expect(key?.status).toBe('active');
    expect(key?.purpose).toBe('context');
    expect(key?.valid_from).toBe(mockDate.toISOString());
  });

  it('returns null when active key is not found', async () => {
    const mockPrisma = {
      signingKey: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const repo = new PrismaSigningKeyRepository(mockPrisma);
    const key = await repo.findActiveKey('context');

    expect(key).toBeNull();
  });

  it('finds key by kid', async () => {
    const mockPrisma = {
      signingKey: {
        findUnique: vi.fn().mockResolvedValue(mockDbRow),
      },
    } as unknown as PrismaClient;

    const repo = new PrismaSigningKeyRepository(mockPrisma);
    const key = await repo.findByKid('k1');

    expect(key).not.toBeNull();
    expect(key?.kid).toBe('k1');
  });

  it('lists valid public keys filtered by purpose and expiration', async () => {
    const mockPrisma = {
      signingKey: {
        findMany: vi.fn().mockResolvedValue([mockDbRow]),
      },
    } as unknown as PrismaClient;

    const repo = new PrismaSigningKeyRepository(mockPrisma);
    const keys = await repo.listValidPublicKeys('context');

    expect(keys.length).toBe(1);
    expect(keys[0].kid).toBe('k1');
  });

  it('executes rotation transaction retiring previous key and saving new active key', async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const upsertMock = vi.fn().mockResolvedValue(mockDbRow);

    const mockTx = {
      signingKey: {
        updateMany: updateManyMock,
        upsert: upsertMock,
      },
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as unknown as PrismaClient;

    const repo = new PrismaSigningKeyRepository(mockPrisma);

    const newKey: SigningKeyEntity = {
      id: '999e4567-e89b-12d3-a456-426614174000',
      kid: 'k2',
      alg: 'EdDSA',
      public_key: '-----BEGIN PUBLIC KEY-----\nk2\n-----END PUBLIC KEY-----',
      status: 'active',
      purpose: 'context',
      valid_from: mockDate.toISOString(),
      valid_until: mockFutureDate.toISOString(),
      created_at: mockDate.toISOString(),
      updated_at: mockDate.toISOString(),
    };

    await repo.rotate(newKey, 'k1');

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { kid: 'k1' },
      data: { status: 'retired' },
    });
    expect(upsertMock).toHaveBeenCalled();
  });
});
