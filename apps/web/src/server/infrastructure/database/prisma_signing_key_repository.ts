import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  SigningKeyEntity,
  SigningKeyPurpose,
  SigningKeyStatus,
} from '@/server/domain/entities/signing_key';
import type { SigningKeyRepository } from '@/server/domain/repositories/signing_key_repository';

function mapSigningKey(row: {
  id: string;
  kid: string;
  alg: string;
  public_key: string;
  status: string;
  purpose: string;
  valid_from: Date;
  valid_until: Date;
  created_at: Date;
  updated_at: Date;
}): SigningKeyEntity {
  return {
    id: row.id,
    kid: row.kid,
    alg: row.alg,
    public_key: row.public_key,
    status: row.status as SigningKeyStatus,
    purpose: row.purpose as SigningKeyPurpose,
    valid_from: row.valid_from.toISOString(),
    valid_until: row.valid_until.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class PrismaSigningKeyRepository implements SigningKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveKey(purpose: SigningKeyPurpose = 'context'): Promise<SigningKeyEntity | null> {
    const row = await this.prisma.signingKey.findFirst({
      where: {
        purpose,
        status: 'active',
      },
      orderBy: { created_at: 'desc' },
    });
    return row ? mapSigningKey(row) : null;
  }

  async findByKid(kid: string): Promise<SigningKeyEntity | null> {
    const row = await this.prisma.signingKey.findUnique({
      where: { kid },
    });
    return row ? mapSigningKey(row) : null;
  }

  async listValidPublicKeys(purpose: SigningKeyPurpose = 'context'): Promise<SigningKeyEntity[]> {
    const now = new Date();
    const rows = await this.prisma.signingKey.findMany({
      where: {
        purpose,
        status: { in: ['active', 'next', 'retired'] },
        valid_until: { gt: now },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(mapSigningKey);
  }

  async save(key: SigningKeyEntity): Promise<void> {
    await this.prisma.signingKey.upsert({
      where: { kid: key.kid },
      create: {
        id: key.id,
        kid: key.kid,
        alg: key.alg,
        public_key: key.public_key,
        status: key.status,
        purpose: key.purpose,
        valid_from: new Date(key.valid_from),
        valid_until: new Date(key.valid_until),
      },
      update: {
        alg: key.alg,
        public_key: key.public_key,
        status: key.status,
        purpose: key.purpose,
        valid_from: new Date(key.valid_from),
        valid_until: new Date(key.valid_until),
      },
    });
  }

  async rotate(newKey: SigningKeyEntity, retireKid?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (retireKid) {
        await tx.signingKey.updateMany({
          where: { kid: retireKid },
          data: { status: 'retired' },
        });
      } else {
        await tx.signingKey.updateMany({
          where: { purpose: newKey.purpose, status: 'active' },
          data: { status: 'retired' },
        });
      }

      await tx.signingKey.upsert({
        where: { kid: newKey.kid },
        create: {
          id: newKey.id,
          kid: newKey.kid,
          alg: newKey.alg,
          public_key: newKey.public_key,
          status: 'active',
          purpose: newKey.purpose,
          valid_from: new Date(newKey.valid_from),
          valid_until: new Date(newKey.valid_until),
        },
        update: {
          status: 'active',
          valid_from: new Date(newKey.valid_from),
          valid_until: new Date(newKey.valid_until),
        },
      });
    });
  }
}
